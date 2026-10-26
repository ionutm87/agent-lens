import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'agent-lens',
  props: { title: 'Agent Lens', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  viewport: { columns: 160, rows: 80 },
} as const

const usage = { model: 'claude-haiku-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// Three subagents driven through the real hooks: a1 runs (3 tool steps), a2 finishes (2 steps), a3 is denied.
test('Agents tab: running, finished with folded steps, denied in Stopped; crab only on the desktop', { timeoutMs: 30000 }, async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: 100_000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 1000000, percent: 1 }, rateLimits: [], cost: { usd: 0 } } }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  let spawned = 0
  on('agent.spawn', () => (++spawned === 3 ? { deny: 'not allowed' } : { agentId: `a${spawned}`, model: 'claude-haiku-5-5' }) as never)
  const tools: Record<string, { name: string; input: unknown }[]> = {
    a1: [{ name: 'Grep', input: { pattern: 'component:' } }, { name: 'Read', input: { file_path: '/home/x/mods/cache-clock/register.tsx' } }, { name: 'Read', input: { file_path: '/home/x/mods/chat-inventory/register.tsx' } }],
    a2: [{ name: 'Bash', input: { command: 'ls mods' } }, { name: 'mcp__codegraph__codegraph_explore', input: { query: 'x' } }],
  }
  on('turn.complete', () => ({ text: 'found' }) as never)
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', stopReason: 'tool_use', usage, toolUses: (tools[e.agentId ?? ''] ?? []).map((t, i) => ({ id: `u${i}`, ...t })) } as never
  })

  await $.agent.spawn({ subagentType: 'Explore', description: 'Survey the other mods', prompt: 'look', parentModel: 'claude-opus-5-5', tool_use_id: 't1' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Find mod sources', prompt: 'find', parentModel: 'claude-opus-5-5', tool_use_id: 't2' } as never)
  await $.agent.spawn({ subagentType: 'general-purpose', description: 'Delete the cache', prompt: 'rm', parentModel: 'claude-opus-5-5', tool_use_id: 't3' } as never)
  for (const agentId of ['a1', 'a2']) {
    for await (const _ of $.turn.step({ turnId: `turn-${agentId}`, index: 0, model: 'claude-haiku-5-5', effort: 'low', messageCount: 1, agentId } as never)) void _
  }
  await $.turn.complete({ turnId: 'turn-a2', agentId: 'a2', reason: 'completed', text: 'found', answer: 'found', durationMs: 31_000, isAborted: false } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-lens', surface, ...PANE })
    await ui.press({ key: 'tab-agents' })
    expect(await ui.find({ type: 'Text', text: /3 subagents in this chat/ }), 'summary').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^subagent tokens$/ }), 'tile').toBeDefined()
    await ui.press({ key: 'ag-hide' })
    expect(await ui.find({ type: 'Text', text: /^subagent tokens$/ }), 'tiles hidden').toBeUndefined()
    expect(await ui.find({ type: 'Button', text: '[show]' }), 'show').toBeDefined()
    await ui.press({ key: 'ag-hide' })
    expect(await ui.find({ type: 'Text', text: /^subagent tokens$/ }), 'tiles back').toBeDefined()

    // Running: the current step and the two before it, type · model · effort.
    expect(await ui.find({ type: 'Text', text: /Running · 1/ }), 'running strip').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Survey the other mods/ }), 'a1').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /◐ Step 3 · Reading chat-inventory\/register\.tsx/ }), 'now').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Reading cache-clock\/register\.tsx/ }), 'prev').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Explore · Haiku 5\.5 · low/ }), 'meta').toBeDefined()

    // Finished: Done · 2 steps, the fold opens the list with the kind column and closes it.
    expect(await ui.find({ type: 'Text', text: /Finished · 1/ }), 'finished strip').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Done · 2 steps/ }), 'done').toBeDefined()
    expect(await ui.find({ type: 'Button', text: '▸ All 2 steps' }), 'fold closed').toBeDefined()
    await ui.press({ key: 'fold-ag-t2-steps' })
    expect(await ui.find({ type: 'Button', text: '▾ Hide steps' }), 'fold open').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Command/ }), 'kind command').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Connector/ }), 'kind connector').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /codegraph · explore/ }), 'connector name').toBeDefined()
    await ui.press({ key: 'fold-ag-t2-steps' })
    expect(await ui.find({ type: 'Text', text: /^Command/ }), 'list closed').toBeUndefined()

    // Stopped: folded by default, the strip opens it.
    expect(await ui.find({ type: 'Text', text: /Stopped · 1/ }), 'stopped strip').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Delete the cache/ }), 'stopped folded').toBeUndefined()
    await ui.press({ key: 'fold-ag-grp-stop' })
    expect(await ui.find({ type: 'Text', text: /Delete the cache/ }), 'stopped open').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Denied · 0 steps/ }), 'denied').toBeDefined()
    await ui.press({ key: 'fold-ag-grp-stop' })
    await ui.press({ key: 'fold-ag-grp-run' })
    expect(await ui.find({ type: 'Text', text: /Survey the other mods/ }), 'running folded').toBeUndefined()
    await ui.press({ key: 'fold-ag-grp-run' })

    if (surface === 'desktop') expect((await ui.find({ type: 'Svg' }))?.props.alt, 'crab').toMatch(/Claude crab/)
    else expect(await ui.find({ type: 'Svg' }), 'no svg on terminal').toBeUndefined()
    await ui.unmount()
  }
})
