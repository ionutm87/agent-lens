import { expect, test } from 'claude-code/testing'

import { cacheLeft, connectorsOf, cycle, isCorrection, mmss, parseRule, withRule } from '../hooks/extras'
import { editDiff } from '../hooks/chat-tab'

const PANE = {
  component: 'Pane',
  requestId: 'agent-lens',
  props: { title: 'Agent Lens', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 160, rows: 60 },
} as const

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 125, rows: 40 },
} as const

const settle = async (check: () => Promise<unknown>) => {
  for (let i = 0; i < 50 && !(await check()); i++) await new Promise(r => setTimeout(r, 10))
}

const USAGE = { value: { startedAt: 0, context: { tokens: 1, window: 1000000, percent: 41 }, rateLimits: [], cost: { usd: 0 } } }

test('folded-in mods: corrections, rules, cache clock, connectors, edits', () => {
  expect(isCorrection('nu, nu deschide browserul decât dacă îți cer')).toBe(true)
  expect(isCorrection("don't run the migration on prod")).toBe(true)
  expect(isCorrection('ți-am zis să folosești Ash')).toBe(true)
  expect(isCorrection('adaugă un tab nou pentru agenți')).toBe(false)
  expect(isCorrection('/model sonnet')).toBe(false)
  expect(parseRule('NONE')).toBe('')
  expect(parseRule('„Never open the browser unless asked.”\nmore')).toBe('Never open the browser unless asked.')
  expect(withRule('', 'Rule A')).toBe('## Rules from corrections\n\n- Rule A\n')
  expect(withRule('# X\n', 'Rule A')).toBe('# X\n\n## Rules from corrections\n\n- Rule A\n')
  expect(withRule(withRule('# X', 'Rule A'), 'Rule B')).toMatch(/- Rule A\n- Rule B\n$/)
  expect(withRule(withRule('# X', 'Rule A'), 'Rule A')).toBe(withRule('# X', 'Rule A'))
  expect(cacheLeft(0, 5, 5)).toBeNull()
  expect(cacheLeft(1000, 1000 + 4 * 60_000, 5)).toBe(60_000)
  expect(cacheLeft(1000, 1000 + 9 * 60_000, 5)).toBe(0)
  expect(mmss(252_000)).toBe('4:12')
  expect(cycle([70, 80, 90], 90)).toBe(70)
  const c = connectorsOf({ 'codegraph:codegraph_explore': 2, 'agent-lens:plan': 3, Bash: 6 })
  expect(c.map(x => x.server)).toEqual(['agent-lens', 'codegraph'])
  expect(c[1]?.tools).toEqual({ explore: 2 })
  expect(editDiff({ at: 0, path: 'a', old: 'x', new: 'y\nz' })).toBe('- x\n+ y\n+ z')
})

test('Agents, Chat and Setup tabs render on both surfaces', { timeoutMs: 30000 }, async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: 10_000 }))
  on('session.usage', () => USAGE)
  on('ui.open', () => ({ value: undefined }) as never)
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: JSON.stringify({ enabledPlugins: { 'ponytail@ponytail': true, 'agent-lens@agent-lens': true } }) }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/cfg', stderr: '' } }))
  on('store.set', () => ({ value: undefined }) as never)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'claude-haiku-5-5' }) as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Survey the other mods', prompt: 'look', parentModel: 'claude-opus-5-5', tool_use_id: 't1' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-lens', surface, ...PANE })
    await ui.press({ key: 'tab-agents' })
    expect(await ui.find({ type: 'Text', text: /1 subagent in this chat/ }), 'a1').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Survey the other mods/ }), 'a2').toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' }), 'a3').toBeDefined()
    await ui.press({ key: 'tab-chat' })
    expect(await ui.find({ type: 'Text', text: /In this chat/ }), 'a4').toBeDefined()
    await ui.press({ key: 'tab-setup' })
    expect(await ui.find({ type: 'Button', key: 'sw-reflect' }), 'a5').toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'th-handoffAt' }), 'a6').toBeDefined()
    await ui.press({ key: 'th-handoffAt' })
    expect(await ui.find({ type: 'Button', label: '[90%]' }), 'a7').toBeDefined()
    if (surface === 'terminal') await ui.press({ key: 'fold-set-plugins' })
    expect(await ui.find({ type: 'Button', key: 'pl-ponytail@ponytail' }), 'a8').toBeDefined()
    await ui.press({ key: 'th-handoffAt' })
    await ui.press({ key: 'th-handoffAt' })
    await ui.unmount()
  }
})

test('the band: plan progress, context, and a correction offered as a rule', { timeoutMs: 30000 }, async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.usage', () => USAGE)
  on('ui.open', () => ({ value: undefined }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Never open the browser unless asked.', usage: {} } }) as never)
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: 'nu, nu deschide browserul decât dacă îți cer', origin: { kind: 'composer' }, wait: false } as never)
  await $.tool.call({ tool: 'mcp__agent-lens__plan', goal: 'Refactor billing', steps: [{ id: 'a', title: 'read', status: 'done' }, { id: 'b', title: 'Move webhook checks', status: 'run' }, { id: 'c', title: 'test' }] } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'agent-lens', surface, ...BAND })
    expect(await band.find({ type: 'Text', text: /ctx 41%/ }), 'ctx').toBeDefined()
    expect(await band.find({ type: 'Text', text: /Now: Move webhook checks/ }), 'now').toBeDefined()
    if (surface === 'desktop') expect(await band.find({ type: 'Svg' })).toBeDefined()
    await band.unmount()
    const ui = await $.ui.mount({ plugin: 'agent-lens', surface, ...PANE })
    await ui.press({ key: 'tab-think' })
    await ui.press({ key: 'stage-during' })
    await settle(() => ui.find({ type: 'Button', key: 'rule-project' }))
    expect(await ui.find({ type: 'Text', text: /1 rule to save/ }), 'rule').toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'rule-project' })).toBeDefined()
    await ui.unmount()
  }
})
