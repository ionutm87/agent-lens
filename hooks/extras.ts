import type { Setup } from '../types'
import { clip } from './changes'

// What used to be separate mods, folded in: the cache clock, the handoff offer, Reflect (a correction saved as a
// rule), the connectors and files of the Chat tab, the crab pets and bars drawn on the desktop. Pure helpers.

export const DEFAULT_SETUP: Setup = { band: true, cache: true, handoff: true, reflect: true, handoffAt: 80, cacheTtlMin: 60, cacheWarnS: 60, holdWords: 40 }

export const setupOf = (raw: unknown): Setup => ({ ...DEFAULT_SETUP, ...(raw && typeof raw === 'object' ? (raw as Partial<Setup>) : {}) })

// The next value in a short list of choices (Setup thresholds), wrapping around.
export const cycle = <T>(choices: readonly T[], now: T) => choices[(choices.indexOf(now) + 1) % choices.length]

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))

  return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Milliseconds the prompt cache has left after the last turn; 0 = cold, null = nothing cached yet.
export const cacheLeft = (idleAt: number, now: number, ttlMin: number) => (idleAt ? Math.max(0, idleAt + ttlMin * 60_000 - now) : null)

// A correction, from the words alone (free): a "no" up front, never/always, "I told you", "wrong", RO and EN.
const CORRECTION = [
  /^(nu|no|nope|stop)\b[\s,.!]/i,
  /\b(don'?t|do not|never|always|stop doing|instead of|not what i (asked|meant)|i (told|said)|wrong|that'?s not)\b/i,
  /\b(nu mai|niciodat[aă]|[iî]ntotdeauna|mereu|de ce ai|ț?i-?am (zis|spus)|ti-?am (zis|spus)|gre[sș]it|nu asta|nu a[sș]a|f[aă]r[aă] s[aă])\b/i,
]
export const isCorrection = (text: string) => {
  const t = text.trim()

  return t.length >= 6 && !t.startsWith('/') && CORRECTION.some(r => r.test(t))
}

export const rulePrompt = (text: string, said: string) => `A developer just corrected an AI coding agent. Decide whether the correction is a lasting preference worth saving as a rule for future sessions (how to work, what to never or always do), not a one-off fix of this task.
Answer ONLY one line: the rule as a short imperative sentence in the developer's language (at most 20 words), or NONE.

What the agent said last: ${clip(said.replace(/\s+/g, ' '), 600) || '(nothing)'}

The developer's message:
${clip(text, 1500)}`

export const parseRule = (raw: string) => {
  const line = (raw.trim().split('\n')[0] ?? '').replace(/^["„“'\-\s]+|["”'\s]+$/g, '')

  return !line || /^none\b/i.test(line) ? '' : clip(line, 200)
}

// A rule appended to a CLAUDE.md, under its own heading, once.
export const withRule = (file: string, rule: string) => {
  const head = '## Rules from corrections'
  const line = `- ${rule}`
  if (file.includes(line)) return file
  const base = file.replace(/\s*$/, '')

  return base.includes(head) ? `${base}\n${line}\n` : `${base}${base ? '\n\n' : ''}${head}\n\n${line}\n`
}

export const HANDOFF_PROMPT =
  'Write a handoff for a fresh session, in one fenced block I can paste as its first prompt: the goal, decisions made and why, what is done, what is left (next steps in order), the files that matter, and how to verify. No other text.'

// MCP tools by server ("codegraph:codegraph_explore" → codegraph), the most used first.
export const connectorsOf = (counts: Record<string, number>) => {
  const by = new Map<string, { calls: number; tools: Record<string, number> }>()
  for (const [name, n] of Object.entries(counts)) {
    const i = name.indexOf(':')
    if (i < 0) continue
    const server = name.slice(0, i)
    const tool = name.slice(i + 1).replace(new RegExp(`^${server}_`), '')
    const row = by.get(server) ?? { calls: 0, tools: {} }
    row.calls += n
    row.tools[tool] = (row.tools[tool] ?? 0) + n
    by.set(server, row)
  }

  return [...by].map(([server, r]) => ({ server, ...r })).sort((a, b) => b.calls - a.calls)
}

// A subagent's tool as the Agents tab names it.
export const stepKind = (tool: string): [string, string] =>
  /^(Read|Grep|Glob)$/.test(tool) ? ['File read', 'green'] : tool === 'Bash' ? ['Command', 'yellow'] : /^(Edit|Write|NotebookEdit)$/.test(tool) ? ['Edit', 'magenta'] : tool.startsWith('mcp__') ? ['Connector', 'blue'] : [tool, 'gray']

export const PET_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#db2777', '#7c3aed', '#0e7490']

// The pixel crab of the Agents tab (desktop): body in `color`, legs apart while it runs.
export const crabSvg = (color: string, isRunning: boolean) => {
  const r = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  const ink = '#2b1d16'
  const legs = isRunning ? [4, 6, 9, 11].map(x => r(x, 9, 3, 3, ink)).join('') + [5, 7, 10, 12].map(x => r(x, 10, 1, 1, color)).join('') : r(3, 9, 12, 3, ink)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 13" shape-rendering="crispEdges">${r(3, 2, 12, 9, ink)}${r(1, 5, 16, 4, ink)}${legs}${r(4, 3, 10, 7, color)}${r(2, 6, 14, 2, color)}${r(6, 4, 1, 2, ink)}${r(11, 4, 1, 2, ink)}</svg>`
}

export const BAND_COLORS = { light: '#c4b5fd', mid: '#8b5cf6', deep: '#6d28d9', track: '#ece9fb' }

// The gradient progress bar (desktop): done part filled, the step under way lighter, a pill with the label.
export const barSvg = (done: number, total: number, width: number, label: string, c = BAND_COLORS) => {
  const h = 14
  const part = total ? Math.round((done / total) * width) : 0
  const next = total && done < total ? Math.round(width / total) : 0
  const pill = label ? Math.min(width, label.length * 6.4 + 16) : 0
  const px = Math.max(0, Math.min(width - pill, part - pill))
  const sparks = [0.1, 0.22, 0.36, 0.45, 0.51, 0.56, 0.6, 0.63, 0.65]
    .map((f, i) => `<rect x="${Math.round(f * part)}" y="${[3, 9, 5, 2, 8, 4, 10, 6, 2][i]}" width="1.6" height="1.6"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${c.light}"/><stop offset=".55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.deep}"/></linearGradient><clipPath id="k"><rect width="${width}" height="${h}" rx="7"/></clipPath></defs><rect width="${width}" height="${h}" rx="7" fill="${c.track}"/><g clip-path="url(#k)"><rect x="${part}" width="${next}" height="${h}" fill="${c.mid}" opacity=".28"/><rect width="${part}" height="${h}" fill="url(#g)"/><g fill="#fff" opacity=".85">${sparks}</g></g>${label ? `<rect x="${px}" width="${pill}" height="${h}" rx="7" fill="${c.deep}"/><text x="${px + pill / 2}" y="10.5" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" font-weight="600" fill="#fff">${label}</text>` : ''}</svg>`
}
