import { expect, test } from 'claude-code/testing'

import { activeStyle, buildStyle, parseStyle, slugName, withOutputStyle } from '../hooks/styles'
import { stylesView } from '../hooks/styles-tab'
import '../hooks/register'

test('style: parse and build are inverse, keep-coding-instructions survives', () => {
  const text = '---\nname: teacher\ndescription: Explains the why\nkeep-coding-instructions: false\n---\n\nLine one.\n- Line two.\n'
  const s = parseStyle('teacher.md', text)
  expect(s).toEqual({ file: 'teacher.md', name: 'teacher', description: 'Explains the why', keep: false, body: 'Line one.\n- Line two.' })
  expect(buildStyle(s)).toBe(text)
  expect(parseStyle('fara.md', 'doar text').name).toBe('fara')
})

test('style: CRLF files keep their frontmatter', () => {
  expect(parseStyle('w.md', '---\r\nname: w\r\ndescription: d\r\n---\r\n\r\nbody\r\n')).toEqual({ file: 'w.md', name: 'w', description: 'd', keep: true, body: 'body' })
})

test('style: a multi-line description cannot break the frontmatter', () => {
  expect(buildStyle({ file: 'x.md', name: 'x', description: 'a\nb', keep: true, body: 'c' })).toContain('description: a b\n')
})

test('style: file name slug', () => {
  expect(slugName('  Stilul Meu: Ăsta! ')).toBe('stilul-meu-asta')
  expect(slugName('!!!')).toBe('')
})

test('settings: outputStyle is set without touching the rest, and read back', () => {
  const out = withOutputStyle('{\n  "a": 1,\n  "outputStyle": "x"\n}\n', 'teacher')
  expect(out).toBe('{\n  "a": 1,\n  "outputStyle": "teacher"\n}\n')
  expect(activeStyle(out)).toBe('teacher')
  expect(activeStyle('not json')).toBe('')
})

// A Button inside a Text is refused by the engine and the whole tab draws empty.
test('style tab: no Button nested in a Text', () => {
  const ui = { Box: 'Box', Text: 'Text', Button: 'Button', Input: 'Input' }
  const s = { file: 'a.md', name: 'a', description: 'd', keep: true, body: 'x\ny' }
  const noop = () => {}
  const act = { open: noop, back: noop, use: noop, desc: noop, line: noop, add: noop, drop: noop, save: noop, fresh: noop, create: noop, refresh: noop }
  const kind = (n: any) => n?.type ?? n?.component ?? n?.tag
  const kids = (n: any): any[] => [n?.children, n?.props?.children].flat(Infinity).filter(c => c && typeof c === 'object')
  const bad = (n: any, inText = false): boolean => (inText && kind(n) === 'Button') || kids(n).some(c => bad(c, inText || kind(n) === 'Text'))
  for (const draft of [null, { file: 'a.md', description: 'd', lines: ['x', 'y'], dirty: false }]) {
    const tree = stylesView(ui, { list: [s], active: 'a', draft, fresh: '', note: '✓ ok', loaded: true, fold: { isOpen: (_k: string, d: boolean) => d, toggle: () => {} } }, act)
    expect(kind(tree)).toBe('Box')
    expect(bad(tree)).toBe(false)
  }
})
