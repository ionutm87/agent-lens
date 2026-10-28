import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'agent-lens',
  props: { title: 'Agent Lens', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
  viewport: { columns: 160, rows: 100 },
} as const

const USAGE = { value: { startedAt: 0, context: { tokens: 1, window: 1000000, percent: 10 }, rateLimits: [], cost: { usd: 0 } } }
const MOD = '/home/me/.claude/mods/agent-lens/hooks'

test('Chat tab: real tool calls fill tools, connectors, files, edits; ◀ ▶, replay and the fold work', { timeoutMs: 30000 }, async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => USAGE)
  on('ui.open', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  // The tools themselves, beneath the mod's hooks: every built-in and connector call succeeds.
  const ran: string[] = []
  on('tool.call', (_$, e) => {
    ran.push(String(e.tool))

    return { result: 'ok' } as never
  })

  // The app's task list, then the work.
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Read the mockup', status: 'completed' }, { content: 'Draw the tab', status: 'in_progress' }, { content: 'Test it', status: 'pending' }] } as never)
  await $.tool.call({ tool: 'Read', file_path: `${MOD}/register.tsx` } as never)
  await $.tool.call({ tool: 'Read', file_path: `${MOD}/kit.tsx` } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${MOD}/chat-tab.tsx`, old_string: 'old line', new_string: 'new line' } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${MOD}/chat-tab.tsx`, old_string: 'second old', new_string: 'second new' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/tmp/x/Main.dc.html', content: '<div>written</div>' } as never)
  await $.tool.call({ tool: 'mcp__codegraph__codegraph_explore', query: 'chatView', projectPath: '/x' } as never)
  await $.tool.call({ tool: 'mcp__codegraph__codegraph_explore', query: 'kit', projectPath: '/x' } as never)
  await $.skill.prompt({ skill: 'artifact-design', text: 'x', frontmatter: {} } as never)
  expect(ran).toContain('Edit')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-lens', surface, ...PANE })
    await ui.press({ key: 'tab-chat' })
    expect(await ui.find({ type: 'Text', text: /In this chat/ }), `${surface} card`).toBeDefined()
    // Tiles: tools (7 calls; the plan tool answers itself, uncounted), connectors, files, skills.
    expect(await ui.find({ type: 'Text', text: /^connectors$/ }), `${surface} tile`).toBeDefined()
    // To-do: the app task list, 1/3 done.
    expect(await ui.find({ type: 'Text', text: /1\/3 · the app.s task list/ }), `${surface} todo`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Draw the tab/ }), `${surface} todo row`).toBeDefined()
    // Connectors: codegraph (explore ×2) and the app task list, 3 calls.
    expect(await ui.find({ type: 'Text', text: /^2 · 3 calls$/ }), `${surface} conn aside`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Codegraph$/ }), `${surface} conn name`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /explore ×2/ }), `${surface} conn tools`).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' }), 'badge svg').toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /^C ?$/ }), 'badge letters').toBeDefined()
    // Files: 2 read, 2 written, the folder kept short.
    expect(await ui.find({ type: 'Text', text: /2 read · 2 written/ }), `${surface} files`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /kit\.tsx …\/agent-lens\/hooks/ }), `${surface} file row`).toBeDefined()
    // Last turn's edits: 3 edits in 2 files, the newest first shown at 1/3.
    expect(await ui.find({ type: 'Text', text: /3 edits · 2 files/ }), `${surface} edits`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1/3' }), `${surface} idx`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '- old line' }), `${surface} diff out`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+ new line' }), `${surface} diff in`).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '- old line' }))?.props.color, `${surface} diff color`).toBe(surface === 'desktop' ? '#991b1b' : 'red')
    await ui.press({ key: 'edit-next' })
    expect(await ui.find({ type: 'Text', text: '2/3' }), `${surface} next`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+ second new' }), `${surface} next diff`).toBeDefined()
    await ui.press({ key: 'edit-prev' })
    expect(await ui.find({ type: 'Text', text: '1/3' }), `${surface} prev`).toBeDefined()
    await ui.press({ key: 'edit-prev' })
    expect(await ui.find({ type: 'Text', text: '1/3' }), `${surface} prev clamps`).toBeDefined()
    // Replay: back to the first, then one edit per 1.2 s, stopping on the last.
    await ui.press({ key: 'edit-next' })
    await ui.press({ key: 'replay' })
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: '1/3' }), `${surface} replay start`).toBeDefined()
    await clock.advance(1200)
    expect(await ui.find({ type: 'Text', text: '2/3' }), `${surface} replay 2`).toBeDefined()
    await clock.advance(1200)
    expect(await ui.find({ type: 'Text', text: '3/3' }), `${surface} replay 3`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+ <div>written</div>' }), `${surface} write diff`).toBeDefined()
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: '3/3' }), `${surface} replay stops`).toBeDefined()
    // Skills.
    expect(await ui.find({ type: 'Text', text: /artifact-design/ }), `${surface} skill`).toBeDefined()
    // Tools by count: folded, the top three on the right; open, every tool.
    expect(await ui.find({ type: 'Text', text: /^Read 2 · Edit 2 · codegraph:codegraph_explore 2 …$/ }), `${surface} tools aside`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Write 1/ }), `${surface} folded`).toBeUndefined()
    await ui.press({ key: 'fold-chat-tools' })
    expect(await ui.find({ type: 'Text', text: /Write 1/ }), `${surface} unfolded`).toBeDefined()
    await ui.press({ key: 'fold-chat-tools' })
    await ui.press({ key: 'edit-prev' })
    await ui.press({ key: 'edit-prev' })
    await ui.unmount()
  }
})
