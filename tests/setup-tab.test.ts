import { expect, test } from 'claude-code/testing'

import '../hooks/register'

const PANE = {
  component: 'Pane',
  requestId: 'agent-lens',
  props: { title: 'Agent Lens', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 160, rows: 60 },
} as const

const USAGE = { value: { startedAt: 0, context: { tokens: 1, window: 1000000, percent: 41 }, rateLimits: [], cost: { usd: 0 } } }
const SETTINGS = { model: 'x', enabledPlugins: { 'ponytail@ponytail': true, 'remember@claude-plugins': false } }

declare const setTimeout: (f: () => void, ms: number) => unknown

const settle = async (check: () => Promise<unknown>) => {
  for (let i = 0; i < 50 && !(await check()); i++) await new Promise<void>(r => setTimeout(r, 10))
}

test('Setup tab: switches flip, thresholds cycle, plugins write settings.json, Hooks and Styles open', { timeoutMs: 60000 }, async ($, on) => {
  const stored: [string, unknown][] = []
  const writes: [string, string][] = []
  const toasts: string[] = []
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: 10_000 }))
  on('session.usage', () => USAGE)
  on('ui.open', () => ({ value: undefined }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', (_$, e: any) => (stored.push([e.key, e.value]), { value: undefined }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/cfg', stderr: '' } }) as never)
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: JSON.stringify(SETTINGS) }))
  on('fs.write', (_$, e: any) => (writes.push([e.path, e.content ?? e.text ?? e.data]), { value: undefined }) as never)
  on('ui.toast', (_$, e: any) => (toasts.push(String(e?.text ?? e?.message ?? e)), { value: undefined }) as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-lens', surface, ...PANE })
    await ui.press({ key: 'tab-setup' })
    expect(await ui.find({ type: 'Text', text: /^Setup$/ }), `${surface} card`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /applies in every chat/ }), `${surface} aside`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /press a row for the next value/ }), `${surface} hint`).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' }), 'desktop pill').toBeDefined()
    else expect(await ui.find({ type: 'Svg' }), 'terminal has no Svg').toBeUndefined()

    // Built in: each switch flips (effort cycles auto → tip → off, so its label changes too).
    const switches = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('sw-'))
    expect(switches.length, `${surface} switches`).toBeGreaterThanOrEqual(5)
    for (const b of switches) {
      expect(b.props.hotkey, `${b.key} no hotkey`).toBeUndefined()
      const state = async () => {
        const f = await ui.find({ type: 'Button', key: b.key })

        return `${!!f?.props.dimColor}|${f?.text}`
      }
      const before = await state()
      await ui.press({ key: b.key! })
      await settle(async () => (await state()) !== before)
      expect(await state(), `${surface} ${b.key} flips`).not.toBe(before)
    }
    expect(stored.some(([k]) => k === 'setup'), 'setup kept in the store').toBe(true)

    // Thresholds: every value in turn, then back to the first.
    for (const [key, n] of [['handoffAt', 3], ['cacheTtlMin', 2], ['cacheWarnS', 3], ['holdWords', 3]] as const) {
      const value = async () => ((await ui.find({ type: 'Box', key: `row-th-${key}` }))?.children[1] as { children: string[] } | undefined)?.children.join('')
      const start = await value()
      const seen = new Set([start])
      for (let i = 0; i < n; i++) {
        const was = await value()
        await ui.press({ key: `th-${key}` })
        await settle(async () => (await value()) !== was)
        seen.add(await value())
      }
      expect(seen.size, `${surface} ${key} values`).toBe(n)
      expect(await value(), `${surface} ${key} back`).toBe(start)
    }

    // Other plugins: a press writes the flipped enabledPlugins to <configDir>/settings.json.
    await settle(() => ui.find({ type: 'Button', key: 'fold-set-plugins' }))
    if (!(await ui.find({ type: 'Button', key: 'pl-ponytail@ponytail' }))) await ui.press({ key: 'fold-set-plugins' })
    expect(await ui.find({ type: 'Button', key: 'pl-remember@claude-plugins' }), `${surface} plugin row`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'claude-plugins' }), `${surface} marketplace`).toBeDefined()
    const n = writes.length
    await ui.press({ key: 'pl-ponytail@ponytail' })
    await settle(async () => writes.length > n)
    const [path, content] = writes.at(-1)!
    expect(path).toBe('/cfg/settings.json')
    expect(JSON.parse(content)).toEqual({ model: 'x', enabledPlugins: { 'ponytail@ponytail': false, 'remember@claude-plugins': false } })
    await settle(async () => toasts.length > 0)
    expect(toasts.at(-1)).toMatch(/ponytail off/)

    // Hooks and Output styles: the tab switches, Setup stays highlighted.
    await ui.press({ key: 'setup-hooks' })
    await settle(() => ui.find({ type: 'Button', key: 'fold-hk-global' }))
    expect(await ui.find({ type: 'Button', key: 'fold-hk-global' }), `${surface} hooks tab`).toBeDefined()
    expect((await ui.find({ type: 'Button', key: 'tab-setup' }))?.props.variant).toBe('primary')
    await ui.press({ key: 'tab-setup' })
    await ui.press({ key: 'setup-styles' })
    await settle(() => ui.find({ type: 'Text', text: /styles · active/ }))
    expect(await ui.find({ type: 'Text', text: /styles · active/ }), `${surface} styles tab`).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'setup-hooks' })).toBeUndefined()
    expect((await ui.find({ type: 'Button', key: 'tab-setup' }))?.props.variant).toBe('primary')
    await ui.unmount()
  }
})
