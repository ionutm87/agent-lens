import { expect, test } from 'claude-code/testing'

import { pickFor, shift, tipFor } from '../hooks/effort'

const PANE = {
  component: 'Pane',
  requestId: 'agent-lens',
  props: { title: 'Agent Lens', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 160, rows: 60 },
} as const

const LONG =
  'vreau sa pot incarca scadentarul cand adaug o datorie noua din formularul de pe web si din aplicatia de telefon, ' +
  'sa citeasca PDF sau XLSX de la banca, sa imi arate randurile inainte sa le salveze si sa le lege de datorie, ' +
  'apoi sa verifice ca platile din extras se potrivesc cu ratele din scadentar si sa imi spuna ce nu se potriveste'

test('effort from the words: costly before quick, plain answers keep the level, Romanian too', () => {
  expect(pickFor('da')).toBeNull()
  expect(pickFor('continuă')).toBeNull()
  expect(pickFor('fix the billing bug in payments')?.level).toBe('high')
  expect(pickFor('adaug scadentarul la datorii')?.why).toBe('a mistake could cost money')
  expect(pickFor('nu merge login-ul')?.level).toBe('high')
  expect(pickFor('unde e fișierul de config?')?.level).toBe('low')
  expect(pickFor('fă un audit de securitate pe tot proiectul')?.level).toBe('max')
  expect(pickFor('lucrează peste noapte până termini migrarea')?.level).toBe('xhigh')
  expect(pickFor('refactor the sidebar layout')).toBeNull()
  expect(shift('high', 1)).toBe('xhigh')
  expect(shift('max', 1)).toBe('max')
  expect(shift('low', -1)).toBe('low')
})

test('model tip: a step down only on a fresh chat, a step up for a long job on a small model', () => {
  expect(tipFor('low', 'claude-opus-5-5', true)?.command).toBe('/model sonnet')
  expect(tipFor('low', 'claude-opus-5-5', false)).toBeNull()
  expect(tipFor('xhigh', 'claude-sonnet-5-5', false)?.command).toBe('/model opus')
  expect(tipFor('high', 'claude-opus-5-5', true)).toBeNull()
})

const settle = async (check: () => Promise<unknown>) => {
  for (let i = 0; i < 50 && !(await check()); i++) await new Promise(r => setTimeout(r, 10))
}

test('before you send: a long prompt is held, goes back in the box, and Flow sends the finished one', { timeoutMs: 30000 }, async ($, on) => {
  const filled: string[] = []
  const passed: string[] = []
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('clock.now', () => ({ value: 1000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 1000000, percent: 0 }, rateLimits: [], cost: { usd: 0 } } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"clarity":6,"missing":["optional or required"],"questions":[],"better":"FINISHED: schedule upload on the debt form"}', usage: {} } }) as never)
  on('prompt.fill', async (_$, e) => {
    filled.push((e as { text: string }).text)
    return { isFilled: true } as never
  })
  on('prompt.submit', async (_$, e) => {
    passed.push(e.text)
    return { text: e.text }
  })

  const r = await $.prompt.submit({ text: LONG, origin: { kind: 'composer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toMatch(/held/)
  expect(passed.length).toBe(0)
  expect(filled[0]).toBe(LONG)

  const ui = await $.ui.mount({ plugin: 'agent-lens', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-think' })
  await settle(() => ui.find({ type: 'Button', key: 'send-finished' }))
  expect(await ui.find({ type: 'Text', text: /YOU WROTE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /FINISHED: schedule upload/ })).toBeDefined()
  // Held, not yet sent: the effort it would get, from its words.
  expect(await ui.find({ type: 'Text', text: /set when sent/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'send-mine' })).toBeDefined()

  await ui.press({ key: 'send-finished' })
  await settle(async () => passed.length > 0)
  expect(passed[0]).toBe('FINISHED: schedule upload on the debt form')
  await ui.press({ key: 'stage-during' })
  expect(await ui.find({ type: 'Text', text: /WHAT AGENT LENS DID/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Held your long prompt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sent the finished prompt/ })).toBeDefined()
  await ui.unmount()
})

test('Enter on the held text sends it as is; a short prompt is never held and gets its effort', { timeoutMs: 30000 }, async ($, on) => {
  const passed: string[] = []
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('clock.now', () => ({ value: 1000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 1000000, percent: 0 }, rateLimits: [], cost: { usd: 0 } } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"clarity":9,"missing":[],"questions":[],"better":""}', usage: {} } }) as never)
  on('prompt.fill', async () => ({ isFilled: true }) as never)
  on('prompt.submit', async (_$, e) => {
    passed.push(e.text)
    return { text: e.text }
  })

  const composer = { kind: 'composer' } as const
  await $.prompt.submit({ text: LONG, origin: composer, wait: false } as never)
  await $.prompt.submit({ text: LONG, origin: composer, wait: false } as never)
  expect(passed).toEqual([LONG])

  await $.prompt.submit({ text: 'fix the payments bug', origin: composer, wait: false } as never)
  expect(passed[1]).toBe('fix the payments bug')
  const ui = await $.ui.mount({ plugin: 'agent-lens', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-think' })
  expect(await ui.find({ type: 'Text', text: /RUN IT WITH/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /a mistake could cost money/ })).toBeDefined()
  await ui.unmount()
})
