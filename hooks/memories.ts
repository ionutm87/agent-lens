// Memories tab: the current project's auto memory (~/.claude/projects/<slug>/memory) as a graph.
// Only the open project's directory: other projects' memories live in other slugs and are not read.
import type { Memory } from '../types'

// Same slug as the engine: any non-alphanumeric character in the path becomes "-".
export const projectSlug = (root: string) => root.replace(/[^a-zA-Z0-9]/g, '-')

const field = (front: string, key: string) => {
  const m = front.match(new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm'))

  return (m?.[1] ?? '').trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"')
}

// Frontmatter (name, description, type — also under `metadata:`) + the [[name]] links from the body.
export const parseMemory = (file: string, text: string) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const front = m?.[1] ?? ''
  const body = (m ? m[2] : text) ?? ''
  const links = [...new Set([...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(l => (l[1] ?? '').trim()))]

  return {
    name: field(front, 'name') || file.replace(/\.md$/, ''),
    type: field(front, 'type') || 'untyped',
    description: field(front, 'description'),
    links,
    body: body.trim(),
  }
}

// MEMORY.md: "- [Title](file.md) — hook", one line per memory.
export const parseIndex = (text: string) => {
  const out: Record<string, { title: string; hook: string }> = {}
  for (const m of text.matchAll(/^\s*-\s*\[([^\]]+)\]\(([^)]+\.md)\)\s*(?:[—–-]\s*(.*))?$/gm)) {
    out[m[2] ?? ''] = { title: m[1] ?? '', hook: (m[3] ?? '').trim() }
  }

  return out
}

// Incoming links: who links to each memory.
export const backlinks = (list: readonly Pick<Memory, 'name' | 'links'>[]) => {
  const out: Record<string, string[]> = {}
  for (const m of list) for (const to of m.links) (out[to] ??= []).push(m.name)

  return out
}

// Which memories a text names (a Bash command, an attachment): by file, as "…/name.md", not as the suffix of another name.
export const namesIn = (text: string, list: readonly Pick<Memory, 'name' | 'file'>[]) =>
  list.filter(m => new RegExp(`(^|[/\\s"'(\\[])${m.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)).map(m => m.name)

// Memories with no link at all, in either direction.
export const isolated = (list: readonly Pick<Memory, 'name' | 'links'>[]) => {
  const back = backlinks(list)

  return list.filter(m => m.links.length === 0 && !back[m.name]?.length).map(m => m.name)
}

// What a memory names in the code, from its backtick spans: a path (`lib/x/y.ex`, `docs/specs/`), a dotted module or
// function (`Billing.Proration`, `Recurring.MonthlyCost.build/2`) or a snake/Camel identifier (`price_cents`, `MF_BANK`).
// Prose, commands with spaces and short words are skipped. Checked in the repo at analyze time: a reference that is
// gone is hard evidence the memory went stale.
export type Ref = { ref: string; kind: 'path' | 'symbol'; needle: string }

export const refsOf = (body: string): Ref[] => {
  const out = new Map<string, Ref>()
  for (const m of body.matchAll(/`([^`\n]{3,80})`/g)) {
    const ref = (m[1] ?? '').trim()
    if (/\s/.test(ref) || /^[-$]/.test(ref) || ref.includes('..')) continue
    if (/^[\w.@-]+(\/[\w.@-]+)+\/?$/.test(ref) && !/\/\d+$/.test(ref)) {
      out.set(ref, { ref, kind: 'path', needle: ref.replace(/\/$/, '') })
      continue
    }
    // `Mod.Sub.fun/2` → its most specific segment (the longest); `snake_case` / `CamelCase` → itself. A miss is what matters.
    const name = ref.replace(/\/\d+$/, '').replace(/\(.*\)$/, '')
    if (!/^[A-Za-z][\w.]*$/.test(name)) continue
    const needle = name.split('.').filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? ''
    if (needle.length < 4 || !(/_/.test(needle) || /[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(needle) || name.includes('.'))) continue
    out.set(ref, { ref, kind: 'symbol', needle })
  }

  return [...out.values()].slice(0, 12)
}

// The "analyze" verdict on one memory, against the open project: does it still help the model here?
// `fix` = the body rewritten with what no longer holds dropped or corrected (stale only); `gone` = references not in the code.
export const VERDICTS = ['relevant', 'stale', 'irrelevant'] as const
export type Verdict = { verdict: (typeof VERDICTS)[number]; why: string; fix?: string; gone?: string[] }

// The model's reply → verdicts by name. It answers a JSON array; anything around it (a fence, a sentence) is ignored,
// and only names that exist with a known verdict are kept.
export const parseVerdicts = (text: string, names: readonly string[]) => {
  const out: Record<string, Verdict> = {}
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  let rows: unknown = []
  try {
    rows = JSON.parse(json)
  } catch {
    return out
  }
  if (!Array.isArray(rows)) return out
  for (const r of rows as { name?: unknown; verdict?: unknown; why?: unknown }[]) {
    const name = String(r?.name ?? '')
    const verdict = String(r?.verdict ?? '') as Verdict['verdict']
    if (!names.includes(name) || !VERDICTS.includes(verdict)) continue
    const fix = typeof r?.fix === 'string' ? r.fix.trim() : ''
    out[name] = { verdict, why: String(r?.why ?? '').trim(), ...(verdict === 'stale' && fix ? { fix } : {}) }
  }

  return out
}

// The memory file with its body replaced and the frontmatter kept as it was.
export const withBody = (text: string, body: string) => {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/)

  return `${m ? m[0] : ''}\n${body.trim()}\n`
}

// MEMORY.md without the line that points at this file.
export const withoutIndexLine = (text: string, file: string) =>
  text
    .split('\n')
    .filter(l => !new RegExp(`^\\s*-\\s*\\[[^\\]]*\\]\\(${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`).test(l))
    .join('\n')

// The memory text with [[target]] (or [[target|alias]]) turned into plain words: the link goes, the sentence stays.
export const withoutLink = (text: string, target: string) =>
  text.replace(new RegExp(`\\[\\[\\s*${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\|([^\\]]*))?\\]\\]`, 'g'), (_, alias?: string) => alias ?? target)

// The graph as Mermaid source, to paste in any viewer (GitHub, mermaid.live): one class per type, a missing target dashed.
export const toMermaid = (list: readonly Pick<Memory, 'name' | 'type' | 'links'>[], verdicts: Record<string, Verdict> = {}) => {
  const id = (name: string) => `m_${name.replace(/[^a-zA-Z0-9]/g, '_')}`
  const names = new Set(list.map(m => m.name))
  const mark = { relevant: '✓ ', stale: '◐ ', irrelevant: '✗ ' } as const
  const lines = ['graph LR']
  for (const m of list) lines.push(`  ${id(m.name)}["${verdicts[m.name] ? mark[verdicts[m.name]!.verdict] : ''}${m.name}<br/><small>${m.type}</small>"]:::${m.type}`)
  for (const m of list)
    for (const to of m.links) lines.push(names.has(to) ? `  ${id(m.name)} --> ${id(to)}` : `  ${id(m.name)} -.-> ${id(to)}["✗ ${to}"]:::missing`)
  lines.push(
    '  classDef user fill:#f5d0fe,stroke:#a21caf',
    '  classDef feedback fill:#fef08a,stroke:#a16207',
    '  classDef project fill:#a5f3fc,stroke:#0e7490',
    '  classDef reference fill:#bfdbfe,stroke:#1d4ed8',
    '  classDef untyped fill:#e5e7eb,stroke:#6b7280',
    '  classDef missing fill:#fecaca,stroke:#b91c1c,stroke-dasharray:4',
  )

  return `${lines.join('\n')}\n`
}
