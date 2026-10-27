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

// The map: every memory a node, every [[link]] a line, laid out by a small force pass (same input, same picture).
// Soft tones per type on a light card of its own, so it reads the same in a light or dark app. `focus` and its
// neighbours stand out; a `type` filter fades the rest; `zoom` narrows the view around the focus. Hover = <title>.
const GRAPH_TONE: Record<string, [string, string, string]> = {
  feedback: ['#DDE6F8', '#9DB3E3', '#2E4A86'],
  project: ['#DCEFE3', '#93C7A8', '#2D5E45'],
  user: ['#EDE4F7', '#B9A3DB', '#5B3F86'],
  reference: ['#FBE7DF', '#E3A898', '#8A3B2B'],
}
const OTHER_TONE: [string, string, string] = ['#ECEAE4', '#C9C4B8', '#4A4741']
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const layout = (list: readonly Pick<Memory, 'name' | 'links'>[]) => {
  const names = list.map(m => m.name)
  const edges = list.flatMap(m => m.links.filter(l => names.includes(l) && l !== m.name).map(l => [m.name, l] as const))
  // ponytail: O(n²) per pass, fine for a few dozen memories; a grid bucket if a project grows to hundreds
  const pos: Record<string, [number, number]> = {}
  names.forEach((n, i) => {
    const a = (i / Math.max(1, names.length)) * Math.PI * 2
    pos[n] = [Math.cos(a), Math.sin(a)]
  })
  for (let it = 0; it < 300; it++) {
    const move: Record<string, [number, number]> = Object.fromEntries(names.map(n => [n, [0, 0]]))
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [a, b] = [pos[names[i]!]!, pos[names[j]!]!]
        const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) + 1e-3, f = 0.05 / (d * d)
        move[names[i]!]![0] += (dx / d) * f; move[names[i]!]![1] += (dy / d) * f
        move[names[j]!]![0] -= (dx / d) * f; move[names[j]!]![1] -= (dy / d) * f
      }
    }
    for (const [from, to] of edges) {
      const [a, b] = [pos[from]!, pos[to]!]
      const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) + 1e-3, f = (d - 0.5) * 0.08
      move[from]![0] -= (dx / d) * f; move[from]![1] -= (dy / d) * f
      move[to]![0] += (dx / d) * f; move[to]![1] += (dy / d) * f
    }
    for (const n of names) {
      const p = pos[n]!, m = move[n]!
      p[0] += Math.max(-0.05, Math.min(0.05, m[0] - p[0] * 0.01))
      p[1] += Math.max(-0.05, Math.min(0.05, m[1] - p[1] * 0.01))
    }
  }

  return { pos, edges }
}

export const graphSvg = (
  list: readonly Pick<Memory, 'name' | 'type' | 'links' | 'description'>[],
  { focus, type, zoom, width }: { focus: string | null; type: string; zoom: number; width: number },
) => {
  const W = width, H = Math.round(width * 0.68), pad = 70
  const { pos, edges } = layout(list)
  const xs = Object.values(pos).map(p => p[0]), ys = Object.values(pos).map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const at = (n: string): [number, number] => [pad + ((pos[n]![0] - x0) / (x1 - x0 || 1)) * (W - 2 * pad), 34 + ((pos[n]![1] - y0) / (y1 - y0 || 1)) * (H - 68)]
  const near = new Set(focus ? [focus, ...edges.filter(e => e.includes(focus)).flat()] : [])
  const shown = (m: Pick<Memory, 'type'>) => type === 'all' || m.type === type
  const [cx, cy] = focus && pos[focus] ? at(focus) : [W / 2, H / 2]
  const vw = W / zoom, vh = H / zoom
  const vx = Math.max(0, Math.min(W - vw, cx - vw / 2)), vy = Math.max(0, Math.min(H - vh, cy - vh / 2))
  const byName = Object.fromEntries(list.map(m => [m.name, m]))
  const lines = edges
    .map(([a, b]) => {
      const [p, q] = [at(a), at(b)]
      const isNear = a === focus || b === focus
      const fade = shown(byName[a]!) && shown(byName[b]!) ? 1 : 0.3

      return `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="${isNear ? '#7F96CF' : '#D6CFC2'}" stroke-width="${isNear ? 2.5 : 1.5}" opacity="${fade}"/>`
    })
    .join('')
  const nodes = list
    .map(m => {
      const [x, y] = at(m.name)
      const [bg, bd, fg] = GRAPH_TONE[m.type] ?? OTHER_TONE
      const label = m.name.length > 26 ? `${m.name.slice(0, 25)}…` : m.name
      const w = label.length * 6.6 + 24
      const isFocus = m.name === focus
      const op = !shown(m) ? 0.28 : focus && !near.has(m.name) ? 0.7 : 1

      return `<g opacity="${op}"><title>${esc(`${m.name} (${m.type})\n${m.description}`)}</title><rect x="${(x - w / 2).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="${w.toFixed(1)}" height="28" rx="14" fill="${bg}" stroke="${isFocus ? '#2B2A27' : bd}" stroke-width="${isFocus ? 2 : 1.2}"/><text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="${isFocus ? 700 : 600}" fill="${fg}">${esc(label)}</text></g>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}"><rect x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="${vw.toFixed(1)}" height="${vh.toFixed(1)}" fill="#FBFAF7"/>${lines}${nodes}</svg>`
}

// What "explain" asks: the memory and its neighbours, a few plain sentences for the person who owns it.
export const explainPrompt = (m: { name: string; type: string; description: string }, body: string, linked: { name: string; description: string }[], said: string) =>
  `Explain one memory of an AI coding agent to the person it belongs to, in 3 or 4 short plain sentences: what it says, why it exists, when the agent applies it, and how it connects to the memories it links to. No headings, no lists, no preamble. Write in the language of this message from the person: "${said.slice(0, 200)}".

Memory "${m.name}" (${m.type}): ${m.description}
---
${body.slice(0, 5000)}
---
${linked.length ? `Linked memories:\n${linked.map(l => `- ${l.name}: ${l.description}`).join('\n')}` : 'It links to no other memory.'}`
