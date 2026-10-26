// Effort for one message, read from its words alone (free, no model call). After wearenocode's Effort Picker
// (Ben AI's four questions, the costly check before the "simple" one), with Romanian words beside the English ones.
// The model is only ever a tip: switching mid-chat makes Claude reread the whole chat.

export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Pick = { level: Level; why: string }
export type ModelTip = { label: string; command: string; note: string }

export const LEVELS: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']
export const rank = (level: Level) => LEVELS.indexOf(level)
export const asLevel = (v: unknown): Level | undefined => (LEVELS.includes(v as Level) ? (v as Level) : undefined)
export const shift = (level: Level, by: number) => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, rank(level) + by))]!

const KEEP =
  /^(yes|yep|yeah|ok(ay)?|sure|go( ahead)?|do it|do that|sounds good|perfect|great|thanks|thank you|cool|nice|next|continue|keep going|go on|da|bine|mersi|mulțumesc|multumesc|super|continuă|continua|mergi|fă-o|fa-o|fă asta|fa asta|[0-9]|[a-d]|option [a-z0-9])[.! ]*$/i

const ALL_OUT =
  /(security (audit|review)|audit (the |my )?(security|code ?base|code)|go all out|max effort|best (you can|possible)|no matter how long|leave no stone|audit de securitate|cât de bine poți|cat de bine poti|efort maxim)/i

const WALK_AWAY =
  /(overnight|while i('| a)?m (asleep|sleeping|away|out|gone|offline)|while i sleep|walk(ing)? away|end[- ]to[- ]end|start to finish|don'?t stop until|without (stopping|asking me|checking in)|autonomous(ly)?|take your time|from scratch|peste noapte|cât dorm|cat dorm|până termini|pana termini|fără să mă (întrebi|intrebi)|fara sa ma intrebi|cap[- ]coadă|cap[- ]coada|de la zero)/i

const COSTLY: readonly [RegExp, string][] = [
  [/(\$\s?\d|\b(price|pricing|invoices?|refunds?|payments?|billing|charges?|stripe|paypercut|revenue|budget|tax(es)?|money)\b|plat[ăa]|pl[ăa]ți|plati|factur|abonament|pre[țt]|bani|rambursare|scaden|datori|tranzac)/i, 'a mistake could cost money'],
  [/(\b(clients?|customers?|users?|subscribers|contracts?)\b|clien[țt]|utilizator)/i, 'people will see it'],
  [/(\b(send|publish|go live|launch|deploy|production|prod|migration)\b|trimite|publică|publica|lansează|lanseaza|produc[țt]ie|migra[țt]i)/i, 'it goes out to people'],
  [/(\b(delete|drop|decide|decision|strategy|pros and cons|is it worth)\b|șterge|sterge|decid|merită|merita)/i, "it's hard to undo"],
  [/(\b(bugs?|broken|crash(es|ed|ing)?|errors?|fail(s|ed|ing)?|not working|debug|security|passwords?)\b|eroare|erori|nu merge|nu func[țt]ioneaz|crap[ăa]|securitate|parol)/i, 'something is broken, so the fix must be proven'],
]

const QUESTION = /^(what|where|when|who|which|is|are|was|does|do|did|can|could|how (many|much|long)|ce|unde|când|cand|cine|care|cât|cat|cum|de ce|e |este|poți|poti)\b/i
const SMALL =
  /(typo|rename|reword|shorter|longer|tweak|small change|quick (one|question|change|fix)|brainstorm|another (one|version|option)|try again|one more|redenume|mai scurt|mai lung|o mic[ăa]|rapid|încă una|inca una)/i

export const pickFor = (text: string): Pick | null => {
  const said = text.trim()
  if (said === '' || KEEP.test(said)) return null
  if (ALL_OUT.test(said)) return { level: 'max', why: 'a long, hard job, done properly' }
  if (WALK_AWAY.test(said)) return { level: 'xhigh', why: 'a long job you hand off' }
  for (const [pattern, why] of COSTLY) if (pattern.test(said)) return { level: 'high', why }
  if ((said.length <= 160 && (QUESTION.test(said) || said.endsWith('?'))) || (said.length <= 300 && SMALL.test(said))) {
    return { level: 'low', why: 'a quick back-and-forth' }
  }

  return null
}

// A step down is offered only at the start of a chat; a long job on a small model gets a step up.
export const tipFor = (level: Level, model: string, isFresh: boolean): ModelTip | null => {
  const name = model.toLowerCase()
  const isBig = /opus|fable/.test(name)
  const isSmall = /sonnet|haiku/.test(name)
  if (level === 'low' && isFresh && isBig) return { label: 'Sonnet', command: '/model sonnet', note: 'a quick one: Sonnet does it for less' }
  if (rank(level) >= rank('xhigh') && isSmall) return { label: 'Opus', command: '/model opus', note: 'a long, hard job goes better on Opus' }
  if (level === 'max' && isFresh && name.includes('opus')) return { label: 'Fable', command: '/model fable', note: 'Fable goes furthest on long jobs, and costs the most' }

  return null
}
