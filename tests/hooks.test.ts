import { expect, test } from 'claude-code/testing'

import { parseCheck, worthChecking } from '../hooks/check'
import { hooksView } from '../hooks/hooks-tab'
import { hasHook, hookFromDraft, hookLabel, offFile, parseSettings, replaceHook, rowsOf, serialize, withHook, withoutHook } from '../hooks/settings-hooks'
import type { Settings } from '../hooks/settings-hooks'
import '../hooks/register'

const settings: Settings = {
  model: 'x',
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'a.sh' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'b', timeout: 5 }, { type: 'command', command: 'c' }] }],
  },
  after: 1,
}

test('hooks: rows from a settings file, matcher kept', () => {
  expect(rowsOf(settings, 'local', 'f.json', false).map(r => [r.event, r.matcher, r.hook.command])).toEqual([
    ['Stop', '', 'a.sh'],
    ['PreToolUse', 'Bash', 'b'],
    ['PreToolUse', 'Bash', 'c'],
  ])
  expect(rowsOf({}, 'global', 'g.json', true)).toEqual([])
})

test('hooks: off parks the hook in the same shape, on brings it back', () => {
  const ref = { event: 'Stop', matcher: '', hook: { type: 'command', command: 'a.sh' } }
  const on = withoutHook(settings, ref)
  const off = withHook({}, ref)
  expect(on.hooks?.Stop).toBeUndefined()
  expect(Object.keys(on)).toEqual(['model', 'hooks', 'after'])
  expect(off).toEqual({ hooks: { Stop: [{ hooks: [ref.hook] }] } })
  expect(hasHook(off, ref)).toBe(true)
  expect(withoutHook(off, ref)).toEqual({})
  expect(withHook(on, ref).hooks?.Stop).toEqual([{ hooks: [ref.hook] }])
  expect(hasHook(settings, { ...ref, matcher: 'Bash' })).toBe(false)
})

test('hooks: an edit stays in place; a new matcher moves it to its own group', () => {
  const old = { event: 'PreToolUse', matcher: 'Bash', hook: { type: 'command', command: 'b', timeout: 5 } }
  const next = { ...old, hook: hookFromDraft(old.hook, ' b2 ', '') }
  expect(next.hook).toEqual({ type: 'command', command: 'b2' })
  expect(replaceHook(settings, old, next).hooks?.PreToolUse?.[0]?.hooks.map(h => h.command)).toEqual(['b2', 'c'])
  expect(replaceHook(settings, old, { ...next, matcher: 'Edit' }).hooks?.PreToolUse?.map(g => g.matcher)).toEqual(['Bash', 'Edit'])
  expect(hookFromDraft(undefined, 'x.sh', '30')).toEqual({ type: 'command', command: 'x.sh', timeout: 30 })
})

test('hooks: a file that is not JSON is refused; parked file and labels', () => {
  expect(() => parseSettings('{ nope')).toThrow()
  expect(() => parseSettings('[]')).toThrow()
  expect(parseSettings('')).toEqual({})
  expect(serialize({ a: 1 })).toBe('{\n  "a": 1\n}\n')
  expect(offFile('/p/.claude/settings.local.json')).toBe('/p/.claude/settings.local.hooks-off.json')
  expect(hookLabel({ type: 'command', command: `if x; then ${'y '.repeat(60)} /bin/sh "$HOME/.orca/claude-hook.sh"; fi` })).toMatch(/^claude-hook\.sh · \d+ chars$/)
  expect(hookLabel({ type: 'prompt', prompt: 'is it done?' })).toBe('is it done?')
})

test('prompt check: JSON read leniently; short follow-ups, commands and answers skipped', () => {
  const raw = 'ok:\n{"clarity": 4, "missing": ["which file"], "questions": [{"ask": "Web or mobile?", "options": ["web", "both"], "default": "web"}], "better": "Fix X in Y"}'
  expect(parseCheck(raw, 7)).toEqual({ at: 7, running: false, clarity: 4, missing: ['which file'], questions: [{ ask: 'Web or mobile?', why: '', options: ['web', 'both'], fallback: 'web' }], better: 'Fix X in Y', note: '' })
  expect(parseCheck('no json', 1)).toBeNull()
  expect(parseCheck('{"clarity": 42}', 1)?.clarity).toBe(10)
  expect(worthChecking('da')).toBe(false)
  expect(worthChecking('/lens open it')).toBe(false)
  expect(worthChecking('[Agent Lens · answers]\n- a\n  → b')).toBe(false)
  expect(worthChecking('repară bugul din billing')).toBe(true)
})

test('hooks tab: no Button nested in a Text, in the list and in each editor', () => {
  const ui = { Box: 'Box', Text: 'Text', Button: 'Button', Input: 'Input', Select: 'Select' }
  const noop = () => {}
  const act = { open: noop, fresh: noop, back: noop, toggle: noop, remove: noop, edit: noop, save: noop, refresh: noop, lens: noop }
  const kind = (n: any) => n?.type ?? n?.component ?? n?.tag
  const kids = (n: any): any[] => [n?.children, n?.props?.children].flat(Infinity).filter(c => c && typeof c === 'object')
  const bad = (n: any, inText = false): boolean => (inText && kind(n) === 'Button') || kids(n).some(c => bad(c, inText || kind(n) === 'Text'))
  const rows = [...rowsOf(settings, 'global', '/h/.claude/settings.json', false), ...rowsOf(settings, 'local', '/p/.claude/settings.local.json', true)]
  const paths = { global: '/h/.claude/settings.json', project: '/p/.claude/settings.json', local: '/p/.claude/settings.local.json' }
  const lens = [{ key: 'check', label: 'prompt check', on: true, what: 'x' }]
  const draftOf = (row: (typeof rows)[number] | null) => ({ row, scope: 'local' as const, event: 'Stop', matcher: '', text: 'a.sh', timeout: '' })
  for (const draft of [null, draftOf(null), draftOf(rows[0]!), draftOf(rows.at(-1)!)]) {
    const tree = hooksView(ui, { rows, draft, note: '✓ ok', loaded: true, paths, lens, fold: { isOpen: (_k: string, d: boolean) => d, toggle: () => {} } }, act)
    expect(kind(tree)).toBe('Box')
    expect(bad(tree)).toBe(false)
  }
})
