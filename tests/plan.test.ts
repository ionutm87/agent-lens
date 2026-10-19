import { expect, test } from 'claude-code/testing'

import { costOf, tierOf } from '../hooks/cost'
import { ANSWERS_TAG, answersMessage, delegationAsk, delegationText, layers, normalizePlan } from '../hooks/plan'

test('steps with no shared dependencies sit on the same level; cycles land last', () => {
  const plan = normalizePlan(
    {
      goal: 'new tab',
      clarity: 14,
      steps: [
        { id: 'a', title: 'read', tier: 'haiku', why: 'reads only' },
        { id: 'b', title: 'types' },
        { id: 'c', title: 'design', after: ['a', 'b', 'zzz'] },
        { id: 'd', title: 'write', tier: 'sonnet', after: ['c'] },
        { id: 'e', title: 'tests', after: ['c'] },
        { id: 'x', title: 'cycle', after: ['y'] },
        { id: 'y', title: 'cycle', after: ['x'] },
      ],
    },
    0,
  )
  expect(plan.clarity).toBe(10)
  expect(plan.steps.map(s => s.tier)).toEqual(['haiku', undefined, undefined, 'sonnet', undefined, undefined, undefined])
  expect(layers(plan.steps).map(l => l.map(s => s.id).join(''))).toEqual(['ab', 'c', 'de', 'xy'])
})

test('malformed model input gets safe values', () => {
  const plan = normalizePlan({ steps: [{ title: 'x', tier: 'gpt', status: 'finished' }], questions: ['where?', { why: 'no ask' }], assumptions: [3, 'ok'] }, 5)
  expect(plan.steps[0]).toEqual({ id: '1', title: 'x', tier: undefined, why: '', after: [], status: 'todo' })
  expect(plan.questions).toEqual([{ ask: 'where?', why: '', options: [], fallback: '' }])
  expect(plan.assumptions).toEqual(['ok'])
  expect(plan.clarity).toBe(0)
  expect(layers(normalizePlan(null, 0).steps)).toEqual([])
})

test('the question carries its options (at most 4) and the default action; the answer carries its text', () => {
  const [q] = normalizePlan({ questions: [{ ask: 'Which lists?', options: ['all', '', 'active', 'test', 'archive', 'too many'], default: 'all' }] }, 0).questions
  expect(q.options).toEqual(['all', 'active', 'test', 'archive'])
  expect(q.fallback).toBe('all')
  expect(answersMessage([])).toBe('')
  expect(answersMessage([{ ask: 'Which lists?', text: 'active' }])).toBe(`${ANSWERS_TAG}\n- Which lists?\n  → active`)
})

test('the mini-plan carries "how I act"; its absence does not break the plan', () => {
  expect(normalizePlan({ goal: 'g', approach: 'read first, then edit', steps: [] }, 0).approach).toBe('read first, then edit')
  expect(normalizePlan({ goal: 'g', steps: [] }, 0).approach).toBe('')
})

test('a confirmed step suggestion travels as an answer: the step is the question, the delegation the text', () => {
  const [s] = normalizePlan({ steps: [{ id: 'a', title: 'find callers', tier: 'haiku', why: 'reads only' }] }, 0).steps
  expect(delegationAsk(s!)).toBe('step find callers')
  expect(delegationText(s!)).toBe('delegate to a haiku subagent (reads only)')
  expect(answersMessage([{ ask: delegationAsk(s!), text: delegationText(s!) }])).toBe(`${ANSWERS_TAG}\n- step find callers\n  → delegate to a haiku subagent (reads only)`)
})

test('cost per model, with cache and the Haiku 100K threshold', () => {
  const usage = (input: number, output: number, read = 0, write = 0) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write })
  const r = (n: number) => Math.round(n * 1e6) / 1e6
  expect(r(costOf('opus', usage(1e6, 1e6)))).toBe(24)
  expect(r(costOf('sonnet', usage(0, 0, 1e6, 1e6)))).toBe(4.2)
  expect(r(costOf('haiku', usage(50_000, 0)))).toBe(0.005)
  expect(r(costOf('haiku', usage(150_000, 0)))).toBe(0.075)
  expect(tierOf('claude-sonnet-5-5')).toBe('sonnet')
})
