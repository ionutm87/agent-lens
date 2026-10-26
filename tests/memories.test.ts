import { expect, test } from 'claude-code/testing'

import { backlinks, isolated, namesIn, parseIndex, parseMemory, projectSlug, parseVerdicts, refsOf, toMermaid, withBody, withoutIndexLine, withoutLink } from '../hooks/memories'
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
    '/m/a.md': '---\nname: a\ndescription: prima\nmetadata:\n  type: feedback\n---\nVezi [[b]] și [[lipsa]], `Mod.Gone` s-a dus.',
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
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    if (e.argv[0] === 'rm') for (const p of e.argv.slice(3)) delete files[p]
    // git rev-parse succeeds (a repo); the symbol lookup finds `Gone` nowhere.
    const isLookup = e.argv[0] === 'sh' && e.argv.includes('Gone')
    return { value: { exitCode: isLookup ? 1 : 0, stdout: '', stderr: '' } }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: '[{"name":"a","verdict":"stale","why":"livrat deja","fix":"Doar [[b]] rămâne."},{"name":"b","verdict":"irrelevant","why":"alt proiect"}]' } }) as never)

  const ui = await $.ui.mount({ plugin: 'agent-lens', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-memories' })
  expect(await ui.find({ type: 'Button', key: 'fold-mem-feedback' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /prima/ })).toBeDefined()
  // The broken link is one decision in NEEDS YOU, with the memories that cite it.
  expect(await ui.find({ type: 'Text', text: /does not exist · cited by a/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'mu-lipsa' })).toBeDefined()
  // "In the prompt" starts folded.
  expect(await ui.find({ type: 'Text', text: /AutoMem · 1\.2k tok/ })).toBeUndefined()
  await ui.press({ key: 'fold-mem-prompt' })
  expect(await ui.find({ type: 'Text', text: /AutoMem · 1\.2k tok/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /outside the index/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Not analyzed yet/ })).toBeDefined()
  // "analyze": Sonnet's verdicts land on the nodes, the flagged one shows its why instead of its description.
  await ui.press({ key: 'mem-analyze' })
  // The card's tiles: one to look at, one to delete.
  expect(await ui.find({ type: 'Text', text: '1', color: 'yellow' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1', color: 'red' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /livrat deja/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /names gone code/ })).toBeDefined()
  await ui.press({ key: 'mo-a' })
  expect(await ui.find({ type: 'Text', text: /cârligul lui a/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /lipsa \(does not exist yet\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /gone from the code: `Mod\.Gone`/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'fold-mv-fix' })).toBeDefined()
  // "apply the fix": the body is replaced, the frontmatter kept, the verdict turns relevant.
  await ui.press({ key: 'mem-fix-a' })
  expect(files['/m/a.md']).toBe('---\nname: a\ndescription: prima\nmetadata:\n  type: feedback\n---\n\nDoar [[b]] rămâne.\n')
  expect(await ui.find({ type: 'Text', text: /rewritten by the fix/ })).toBeDefined()
  await ui.press({ key: 'go-out-b' })
  expect(await ui.find({ type: 'Text', text: /missing from the index/ })).toBeDefined()
  // "delete" on the irrelevant one: file gone, the index untouched by it (b was never in it).
  await ui.press({ key: 'mem-del-b' })
  expect('/m/b.md' in files).toBe(false)
  expect(files['/m/MEMORY.md']).toBe('- [A](a.md) — cârligul lui a\n')
  // b is gone (its open view closed with it), so a's [[b]] is a broken link now: "unlink" keeps the word.
  await ui.press({ key: 'mu-b' })
  expect(files['/m/a.md']).toBe('---\nname: a\ndescription: prima\nmetadata:\n  type: feedback\n---\n\nDoar b rămâne.\n')
  await ui.unmount()
})

test('analyze: verdicts are read from the JSON array, unknown names and verdicts dropped, fix only on stale', () => {
  const text = 'Here:\n```json\n[{"name":"a","verdict":"stale","why":" done in M2 ","fix":" new body "},{"name":"ghost","verdict":"relevant"},{"name":"b","verdict":"maybe"},{"name":"c","verdict":"relevant","fix":"ignored"}]\n```'
  expect(parseVerdicts(text, ['a', 'b', 'c'])).toEqual({ a: { verdict: 'stale', why: 'done in M2', fix: 'new body' }, c: { verdict: 'relevant', why: '' } })
  expect(parseVerdicts('no json here', ['a'])).toEqual({})
})

test('code references: paths and symbols from backticks, prose and commands skipped', () => {
  const body = 'See `lib/moneyflip/billing/proration.ex` and `docs/specs/`; `Billing.Proration` deleted, `Recurring.MonthlyCost.build/2`, `price_cents`, `MF_BANK`, `mix test`, `o să vedem`, `ok`, `-x`, `Foo`.'
  expect(refsOf(body)).toEqual([
    { ref: 'lib/moneyflip/billing/proration.ex', kind: 'path', needle: 'lib/moneyflip/billing/proration.ex' },
    { ref: 'docs/specs/', kind: 'path', needle: 'docs/specs' },
    { ref: 'Billing.Proration', kind: 'symbol', needle: 'Proration' },
    { ref: 'Recurring.MonthlyCost.build/2', kind: 'symbol', needle: 'MonthlyCost' },
    { ref: 'price_cents', kind: 'symbol', needle: 'price_cents' },
    { ref: 'MF_BANK', kind: 'symbol', needle: 'MF_BANK' },
  ])
})

test('fix keeps the frontmatter; delete drops the index line only', () => {
  expect(withBody('---\nname: a\n---\n\nold\n', 'new\nbody')).toBe('---\nname: a\n---\n\nnew\nbody\n')
  expect(withBody('no front', 'x')).toBe('\nx\n')
  expect(withoutIndexLine('- [A](a.md) — a\n- [AB](a-b.md) — ab\n', 'a.md')).toBe('- [AB](a-b.md) — ab\n')
})

test('mermaid: one node per memory, a missing target dashed, the verdict on the label', () => {
  const src = toMermaid([{ name: 'cip-pdf', type: 'project', links: ['layout', 'gone'] }, { name: 'layout', type: 'feedback', links: [] }], { 'cip-pdf': { verdict: 'relevant', why: '' } })
  expect(src.startsWith('graph LR\n')).toBe(true)
  expect(src).toContain('m_cip_pdf["✓ cip-pdf<br/><small>project</small>"]:::project')
  expect(src).toContain('m_cip_pdf --> m_layout')
  expect(src).toContain('m_cip_pdf -.-> m_gone["✗ gone"]:::missing')
})

test('unlink: [[x]] and [[x|alias]] become words, other links stay', () => {
  expect(withoutLink('Vezi [[x]], [[ x |zis]] și [[y]].', 'x')).toBe('Vezi x, zis și [[y]].')
})
