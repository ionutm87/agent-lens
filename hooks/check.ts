import type { PromptCheck } from '../types'
import { clip } from './changes'
import { ANSWERS_TAG, questionsOf, strs } from './plan'

// The prompt check: at submit, Haiku reads the prompt alone (not the code) and says what is missing, with
// questions answered from Flow and the prompt rewritten. It helps the person phrase the request; the model does not wait.

// What the person typed, without the blocks the app adds around it (`<artifact-view-context …>…</…>`,
// `<system-reminder>`…): those are not their words, so they count for no length, check or effort.
export const ownText = (text: string) => text.replace(/<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').trim()

// Too short to judge ("da", "ok"), a slash command, or answers sent from the tab: not checked.
export const worthChecking = (text: string) => {
  const t = text.trim()

  return t.length >= 8 && !t.startsWith('/') && !t.startsWith(ANSWERS_TAG)
}

export const checkPrompt = (text: string, previous: string) => `You check a prompt a developer just sent to an AI coding agent that works in their repository. You see the prompt only; the agent will read the code itself, so never ask what the code answers.
Ask only what the developer alone knows: the intended result, the scope (which screens, modules, platforms), constraints, what "done" means, a choice between reasonable options. A short follow-up ("yes", "go on", "do it") is as clear as the previous prompt.
Answer ONLY a JSON object, in the prompt's language:
{"clarity": <0-10, 10 = nothing left to guess>, "missing": [<up to 3 things the prompt leaves out, at most 8 words each>], "questions": [<up to 3, only when clarity < 8: {"ask": "<closed question>", "options": [<2-4 answers of 1-4 words, the first recommended>], "default": "<what the agent will likely assume>"}>], "better": "<the prompt rewritten so nothing is left to guess, or \\"\\" when it is already clear>"}

Previous prompt: ${clip(previous, 1500) || '(none)'}

Prompt:
${clip(text, 4000)}`

// Lenient: the first {...} in the answer; anything missing or mistyped gets a safe value.
export const parseCheck = (raw: string, at: number): PromptCheck | null => {
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  try {
    const o = JSON.parse(json) as Record<string, unknown>

    return {
      at,
      running: false,
      clarity: Math.max(0, Math.min(10, Math.round(Number(o.clarity) || 0))),
      missing: strs(o.missing).slice(0, 3),
      questions: questionsOf(o.questions).slice(0, 3),
      better: typeof o.better === 'string' ? o.better.trim() : '',
      note: '',
    }
  } catch {
    return null
  }
}
