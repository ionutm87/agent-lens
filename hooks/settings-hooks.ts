// The "Hooks" tab: Claude Code's own hooks, from the settings files. Pure parsing/editing here; the I/O lives in register.tsx.
// Settings have no per-hook switch: an "off" hook is parked, in the same shape, in a sibling *.hooks-off.json.
import type { HookEntry, HookRow } from '../types'

type Group = { matcher?: string; hooks: HookEntry[] }
export type Settings = { [key: string]: unknown; hooks?: Record<string, Group[]> }
export type HookRef = { event: string; matcher: string; hook: HookEntry }

export const EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'UserPromptSubmit', 'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd'] as const

export const offFile = (file: string) => file.replace(/\.json$/, '.hooks-off.json')

// A missing file is empty; one that is not a JSON object throws, so it is never overwritten.
export const parseSettings = (text: string): Settings => {
  if (!text.trim()) return {}
  const v: unknown = JSON.parse(text)
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not a JSON object')

  return v as Settings
}

export const serialize = (s: Settings) => `${JSON.stringify(s, null, 2)}\n`

const groupsOf = (s: Settings): Record<string, Group[]> => (s.hooks && typeof s.hooks === 'object' ? s.hooks : {})

const matcherOf = (g: Group) => (typeof g?.matcher === 'string' ? g.matcher : '')

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// `hooks` keeps its place among the settings' keys; left empty, it goes.
const withGroups = (s: Settings, hooks: Record<string, Group[]>): Settings => {
  const out: Settings = { ...s, hooks }
  if (!Object.keys(hooks).length) delete out.hooks

  return out
}

export const rowsOf = (s: Settings, scope: HookRow['scope'], file: string, isOff: boolean): HookRow[] =>
  Object.entries(groupsOf(s)).flatMap(([event, groups]) =>
    (Array.isArray(groups) ? groups : []).flatMap((g, gi) =>
      (Array.isArray(g?.hooks) ? g.hooks : []).map((hook, hi) => ({ id: `${scope}:${isOff ? 'off' : 'on'}:${event}:${gi}:${hi}`, scope, file, event, matcher: matcherOf(g), hook, isOff })),
    ),
  )

export const hasHook = (s: Settings, r: HookRef) => (groupsOf(s)[r.event] ?? []).some(g => matcherOf(g) === r.matcher && g.hooks?.some(h => same(h, r.hook)))

// Drops the first equal hook, then a group or an event left empty.
export const withoutHook = (s: Settings, r: HookRef): Settings => {
  let isGone = false
  const groups = (groupsOf(s)[r.event] ?? [])
    .map(g => {
      const i = isGone || matcherOf(g) !== r.matcher ? -1 : g.hooks.findIndex(h => same(h, r.hook))
      if (i < 0) return g
      isGone = true

      return { ...g, hooks: g.hooks.filter((_, j) => j !== i) }
    })
    .filter(g => g.hooks?.length)
  const hooks = { ...groupsOf(s), [r.event]: groups }
  if (!groups.length) delete hooks[r.event]

  return withGroups(s, hooks)
}

// Into the event's group with the same matcher, else a new group at its end.
export const withHook = (s: Settings, r: HookRef): Settings => {
  const groups = groupsOf(s)[r.event] ?? []
  const i = groups.findIndex(g => matcherOf(g) === r.matcher)
  const next = i >= 0 ? groups.map((g, j) => (j === i ? { ...g, hooks: [...g.hooks, r.hook] } : g)) : [...groups, { ...(r.matcher ? { matcher: r.matcher } : {}), hooks: [r.hook] }]

  return withGroups(s, { ...groupsOf(s), [r.event]: next })
}

// Same event and matcher: in place, so the order the hooks run in stays; otherwise it moves.
export const replaceHook = (s: Settings, old: HookRef, next: HookRef): Settings => {
  if (old.event !== next.event || old.matcher !== next.matcher) return withHook(withoutHook(s, old), next)
  let isDone = false
  const groups = (groupsOf(s)[old.event] ?? []).map(g =>
    matcherOf(g) !== old.matcher
      ? g
      : {
          ...g,
          hooks: g.hooks.map(h => {
            if (isDone || !same(h, old.hook)) return h
            isDone = true

            return next.hook
          }),
        },
  )

  return withGroups(s, { ...groupsOf(s), [old.event]: groups })
}

// The field a hook's work is written in, by type: a command, an http url, otherwise a prompt (prompt, agent).
export const mainKey = (hook: HookEntry) => (hook.type === 'command' ? 'command' : hook.type === 'http' ? 'url' : 'prompt')
export const mainText = (hook: HookEntry) => String(hook[mainKey(hook)] ?? '')

// A long one-liner reads by the script it runs: "claude-hook.sh · 3120 chars".
export const hookLabel = (hook: HookEntry) => {
  const text = mainText(hook).replace(/\s+/g, ' ').trim()
  const script = text.length > 90 ? text.match(/[\w.-]+\.(?:sh|py|js|mjs|ts|rb|cmd)\b/g)?.at(-1) : undefined

  return script ? `${script} · ${text.length} chars` : text
}

// The edited hook keeps its other fields (async, statusMessage…); a new one is a command hook.
export const hookFromDraft = (base: HookEntry | undefined, text: string, timeout: string): HookEntry => {
  const hook: HookEntry = { ...(base ?? { type: 'command' }) }
  hook[mainKey(hook)] = text.trim()
  if (timeout.trim()) hook.timeout = Number(timeout.trim())
  else delete hook.timeout

  return hook
}
