import { expect, test } from 'claude-code/testing'

import { backlinks, isolated, namesIn, parseIndex, parseMemory, projectSlug, parseVerdicts, toMermaid } from '../hooks/memories'
import '../hooks/register'

test('project slug: same as the engine, only the open project memory', () => {
  expect(projectSlug('/home/user/code/app')).toBe('-home-user-code-app')
})

test('frontmatter with type under metadata and unique [[name]] links', () => {
  const text = '---\nname: a\ndescription: "Despre \\"x\\""\nmetadata:\n  node_type: memory\n  type: feedback\n---\n\nVezi [[b]] și [[c|alias]], iar [[b]] încă o dată.'
  expect(parseMemory('a.md', text)).toEqual({ name: 'a', type: 'feedback', description: 'Despre "x"', links: ['b', 'c'], body: 'Vezi [[b]] și [[c|alias]], iar [[b]] încă o dată.' })
  expect(parseMemory('fara.md', 'doar text').name).toBe('fara')
})

test('MEMORY.md index: title and hook per file', () => {
  expect(parseIndex('- [Titlu A](a.md) — cârligul lui a\n- [B](b.md)\nalt rând')).toEqual({ 'a.md': { title: 'Titlu A', hook: 'cârligul lui a' }, 'b.md': { title: 'B', hook: '' } })
})

test('graph: incoming links and isolated nodes', () => {
  const list = [
    { name: 'a', links: ['b'] },
    { name: 'b', links: [] },
    { name: 'c', links: [] },
  ]
  expect(backlinks(list)).toEqual({ b: ['a'] })
  expect(isolated(list)).toEqual(['c'])
})

test('names in text: by whole file, not as a suffix', () => {
  const list = [
    { name: 'data', file: 'data.md' },
    { name: 'big-data', file: 'big-data.md' },
  ]
  expect(namesIn('cat /m/big-data.md', list)).toEqual(['big-data'])
  expect(namesIn('cat /m/data.md /m/big-data.md', list)).toEqual(['data', 'big-data'])
})

const PANE = {
  component: 'Pane',
  requestId: 'agent-lens',
  props: { title: 'Agent Lens', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 160, rows: 50 },
} as const

test('Memories tab: the graph, the index in context and memory neighbors', async ($, on) => {
  const files: Record<string, string> = {
    '/m/MEMORY.md': '- [A](a.md) — cârligul lui a\n',
    '/m/a.md': '---\nname: a\ndescription: prima\nmetadata:\n  type: feedback\n---\nVezi [[b]] și [[lipsa]].',
    '/m/b.md': '---\nname: b\ndescription: a doua\nmetadata:\n  type: project\n---\nNimic.',
  }
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.root', () => ({ value: '/p' }))
  on('clock.now', () => ({ value: 0 }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 1, window: 1000000, percent: 0, breakdown: { memoryFiles: [{ path: '/m/MEMORY.md', type: 'AutoMem', tokens: 1200 }] } },
      rateLimits: [],
    },
  }) as never)
  on('fs.list', ($, e) => ({
    value: e.path === '/m' ? Object.keys(files).map(f => ({ name: f.slice(3), kind: 'file' as const, size: files[f]?.length ?? 0, mtimeMs: 0, isLink: false })) : [],
  }))
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '[{"name":"a","verdict":"stale","why":"livrat deja"},{"name":"b","verdict":"relevant","why":"ok"}]' } }) as never)

  const ui = await $.ui.mount({ plugin: 'agent-lens', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-memories' })
  expect(await ui.find({ type: 'Text', text: /IN THE PROMPT/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /FEEDBACK/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /prima/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'go-a-b' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /lipsa \(does not exist\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /AutoMem · 1\.2k tok/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /outside the index/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Not analyzed yet/ })).toBeDefined()
  // "analyze": Sonnet's verdicts land on the nodes, the flagged one shows its why instead of its description.
  await ui.press({ key: 'mem-analyze' })
  expect(await ui.find({ type: 'Text', text: /◐ 1 stale/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /livrat deja/ })).toBeDefined()
  await ui.press({ key: 'mo-a' })
  expect(await ui.find({ type: 'Text', text: /cârligul lui a/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /lipsa \(does not exist yet\)/ })).toBeDefined()
  await ui.press({ key: 'go-out-b' })
  expect(await ui.find({ type: 'Text', text: /missing from the index/ })).toBeDefined()
  await ui.unmount()
})

test('analyze: verdicts are read from the JSON array, unknown names and verdicts dropped', () => {
  const text = 'Here:\n```json\n[{"name":"a","verdict":"stale","why":" done in M2 "},{"name":"ghost","verdict":"relevant"},{"name":"b","verdict":"maybe"}]\n```'
  expect(parseVerdicts(text, ['a', 'b'])).toEqual({ a: { verdict: 'stale', why: 'done in M2' } })
  expect(parseVerdicts('no json here', ['a'])).toEqual({})
})

test('mermaid: one node per memory, a missing target dashed, the verdict on the label', () => {
  const src = toMermaid([{ name: 'cip-pdf', type: 'project', links: ['layout', 'gone'] }, { name: 'layout', type: 'feedback', links: [] }], { 'cip-pdf': { verdict: 'relevant', why: '' } })
  expect(src.startsWith('graph LR\n')).toBe(true)
  expect(src).toContain('m_cip_pdf["✓ cip-pdf<br/><small>project</small>"]:::project')
  expect(src).toContain('m_cip_pdf --> m_layout')
  expect(src).toContain('m_cip_pdf -.-> m_gone["✗ gone"]:::missing')
})
