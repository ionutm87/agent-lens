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

