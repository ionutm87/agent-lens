import type { Memory, MemoryAudit, MemoryMeta, MemoryUse, MemoryView } from '../types'
import { backlinks, isolated } from './memories'

// Memories tab, drawing only. Whatever touches `$` (reading the directory, tracking tools) lives in
// register.tsx, with the atoms: the engine does not let `$` pass into an imported function and reads atoms only from their own file.

export const INDEX = 'MEMORY.md'
const TYPE_COLOR: Record<string, string> = { project: 'cyan', feedback: 'yellow', reference: 'blue', user: 'magenta' }
// What each memory type is for, and why it matters to the model. The four types are the memory system's own taxonomy.
const TYPE_HELP: Record<string, string> = {
  user: 'user: who you are, your role and preferences. Shapes every answer.',
  feedback: 'feedback: how to work with you, corrections and confirmed approaches, with the why. Applied to every similar task.',
  project: 'project: ongoing work, goals and deadlines not visible in the code. Goes stale, so check its dates.',
  reference: 'reference: pointers to external systems (dashboards, tickets, docs). Tells the model where to look.',
}
// The four types in the order they matter to the model, then whatever else the frontmatter says.
const TYPE_ORDER = ['user', 'feedback', 'project', 'reference']
const TYPE_SHORT: Record<string, string> = { user: 'who you are', feedback: 'how to work with you', project: 'ongoing work, goes stale', reference: 'where to look' }
// The analysis verdicts: problems sort first, so what to clean up is on top.
export const VERDICT = {
  irrelevant: { mark: '✗', color: 'red', rank: 0 },
  stale: { mark: '◐', color: 'yellow', rank: 1 },
  relevant: { mark: '✓', color: 'green', rank: 2 },
} as const
const ago = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`)
const UNTYPED = 'untyped: no type in the frontmatter, so the model cannot tell when it applies.'
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const tail = (path: string) => path.split('/').slice(-2).join('/')
const clip = (text: string, n = 70) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

export type MemoryData = { list: Memory[]; meta: MemoryMeta; use: Record<string, MemoryUse>; opened: MemoryView | null; filter: string; audit: MemoryAudit; now: number }
export type MemoryActions = { open: (name: string) => void; back: () => void; filter: (type: string) => void; refresh: () => void; analyze: () => void; mermaid: (press: any) => void; fix: (name: string) => void; remove: (names: string[]) => void }
type Ui = { Box: any; Text: any; Button: any; Markdown: any } // ponytail: terminal elements, untyped here; register.tsx provides them from $.ui.resolve

export const memoriesView = ({ Box, Text, Button, Markdown }: Ui, { list, meta, use, opened, filter, audit, now }: MemoryData, act: MemoryActions) => {
  const back = backlinks(list)
  const names = new Set(list.map(m => m.name))
  const edges = list.reduce((n, m) => n + m.links.filter(l => names.has(l)).length, 0)
  const lonely = isolated(list)
  const marks = (name: string) => {
    const u = use[name]

    return u ? `${u.read ? ` ◉${u.read}` : ''}${u.write ? ` ✎${u.write}` : ''}${u.recalled ? ` ↺${u.recalled}` : ''}` : ''
  }
  const open = (name: string) => () => act.open(name)

  if (!meta.loaded) return <Text dimColor>Reading the project memory…</Text>
  if (!list.length) return <Text dimColor>The project has no memories in {meta.dir || '—'}.</Text>

  // An open memory: its neighbors in the graph (what it cites, who cites it) and how it was used.
  const node = opened && list.find(m => m.name === opened.name)
  if (opened && node) {
    const out = node.links
    const inc = back[node.name] ?? []
    const u = use[node.name]
    const edge = (name: string, i: number, all: string[], dir: string) => (
      <Box key={`${dir}-${name}`}>
        <Text dimColor>{i === all.length - 1 ? '  └─ ' : '  ├─ '}</Text>
        {names.has(name) ? (
          <Button key={`go-${dir}-${name}`} plain label={name} onPress={open(name)} />
        ) : (
          <Text color="red">✗ {name} (does not exist yet)</Text>
        )}
        <Text dimColor>{marks(name)}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color={TYPE_COLOR[node.type]} wrap="truncate-end">◆ {node.name}</Text>
          <Button key="mem-back" plain label="← graf" hotkey="b" onPress={act.back} />
        </Box>
        <Text dimColor wrap="wrap">{node.type} · {k(node.size)} B · {node.description}</Text>
        <Text dimColor wrap="wrap">{TYPE_HELP[node.type] ?? UNTYPED}</Text>
        {audit.verdicts[node.name] ? (
          <Text wrap="wrap">
            <Text color={VERDICT[audit.verdicts[node.name]!.verdict].color}>{VERDICT[audit.verdicts[node.name]!.verdict].mark} {audit.verdicts[node.name]!.verdict}</Text>
            <Text dimColor> · {audit.verdicts[node.name]!.why}</Text>
          </Text>
        ) : null}
        {audit.verdicts[node.name]?.gone?.length ? <Text wrap="wrap" color="red">gone from the code: {audit.verdicts[node.name]!.gone!.map(r => `\`${r}\``).join(', ')}</Text> : null}
        {audit.verdicts[node.name] && audit.verdicts[node.name]!.verdict !== 'relevant' ? (
          <Box gap={1} marginTop={1}>
            {audit.verdicts[node.name]!.fix ? <Button key={`mem-fix-${node.name}`} variant="primary" label="apply the fix" onPress={() => act.fix(node.name)} /> : null}
            <Button key={`mem-del-${node.name}`} label="delete" onPress={() => act.remove([node.name])} />
          </Box>
        ) : null}
        {audit.verdicts[node.name]?.fix ? (
          <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
            <Text bold color="yellow">PROPOSED FIX · replaces the body, keeps the frontmatter</Text>
            <Markdown text={audit.verdicts[node.name]!.fix!} />
          </Box>
        ) : null}
        <Text wrap="wrap">
          <Text dimColor>in prompt (MEMORY.md): </Text>
          {node.indexed ? <Text>„{node.hook}”</Text> : <Text color="red">missing from the index: the model sees it only if it looks for it</Text>}
        </Text>
        <Text dimColor>
          in session: read {u?.read ?? 0} · written {u?.write ?? 0} · recalled {u?.recalled ?? 0}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>LINKS TO → {out.length}</Text>
          {out.length === 0 && <Text dimColor>  —</Text>}
          {out.map((n, i) => edge(n, i, out, 'out'))}
          <Text bold dimColor>CITED BY ← {inc.length}</Text>
          {inc.length === 0 && <Text dimColor>  —</Text>}
          {inc.map((n, i) => edge(n, i, inc, 'in'))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Markdown text={opened.body} />
        </Box>
      </Box>
    )
  }

  const v = (name: string) => audit.verdicts[name]
  const counts = { relevant: 0, stale: 0, irrelevant: 0 }
  for (const m of list) if (v(m.name)) counts[v(m.name)!.verdict]++
  const analyzed = Object.keys(audit.verdicts).length > 0
  const types = [...new Set([...TYPE_ORDER.filter(t => list.some(m => m.type === t)), ...list.map(m => m.type)])]
  const pass = (m: Memory) => filter === 'all' || m.type === filter || (filter.startsWith('v:') && v(m.name)?.verdict === filter.slice(2))
  const degree = (m: Memory) => (back[m.name]?.length ?? 0) + m.links.length
  const order = (a: Memory, b: Memory) => (v(a.name) ? VERDICT[v(a.name)!.verdict].rank : 3) - (v(b.name) ? VERDICT[v(b.name)!.verdict].rank : 3) || degree(b) - degree(a) || a.name.localeCompare(b.name)
  const typeOf = (name: string) => list.find(m => m.name === name)?.type ?? ''
  const reads = Object.entries(use).filter(([n, u]) => n !== INDEX && u.read).length
  const writes = Object.values(use).reduce((n, u) => n + u.write, 0)
  const recalled = Object.entries(use).filter(([, u]) => u.recalled).length
  const missing = list.filter(m => !m.indexed).length

  // One memory as a node: verdict, name, who cites it; then what it is (or why it is flagged) and its outgoing edges.
  const nodeView = (m: Memory) => {
    const verdict = v(m.name)
    const look = verdict ? VERDICT[verdict.verdict] : null
    const inN = back[m.name]?.length ?? 0
    const flagged = verdict && verdict.verdict !== 'relevant'

    return (
      <Box key={`mem-${m.name}`} flexDirection="column">
        <Box>
          <Text color={look?.color} dimColor={!look}>{look ? `${look.mark} ` : '· '}</Text>
          <Button key={`mo-${m.name}`} plain label={m.name} onPress={open(m.name)} />
          {inN > 0 && <Text color="cyan">{`  ←${inN}`}</Text>}
          {lonely.includes(m.name) && <Text dimColor>  isolated</Text>}
          {!m.indexed && <Text color="red">  outside MEMORY.md</Text>}
          <Text color="green">{marks(m.name)}</Text>
        </Box>
        <Text wrap="truncate-end" color={flagged ? look?.color : undefined} dimColor={!flagged}>
          {'   '}
          {flagged ? verdict.why : clip(m.description || m.hook, 90)}
        </Text>
        {verdict?.gone?.length ? <Text wrap="truncate-end" color="red">{'   '}gone: {verdict.gone.map(r => `\`${r}\``).join(' ')}</Text> : null}
        {flagged && (
          <Box>
            <Text>{'   '}</Text>
            {verdict.fix ? <Button key={`mf-${m.name}`} plain label="[fix]" onPress={() => act.fix(m.name)} /> : null}
            {verdict.fix ? <Text> </Text> : null}
            <Button key={`md-${m.name}`} plain label="[delete]" onPress={() => act.remove([m.name])} />
          </Box>
        )}
        {m.links.map((to, i) => (
          <Box key={`edge-${m.name}-${to}`}>
            <Text dimColor>{i === m.links.length - 1 ? '   └→ ' : '   ├→ '}</Text>
            {names.has(to) ? (
              <Button key={`go-${m.name}-${to}`} plain label={to} onPress={open(to)} />
            ) : (
              <Text color="red">✗ {to} (does not exist)</Text>
            )}
            {names.has(to) && <Text color={TYPE_COLOR[typeOf(to)]} dimColor>{` ${typeOf(to)}`}</Text>}
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-start" dimColor>{meta.dir}</Text>
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text bold>{list.length}</Text>
          <Text dimColor> memories · </Text>
          <Text bold>{edges}</Text>
          <Text dimColor> links · {lonely.length} isolated</Text>
          {missing > 0 && <Text color="red"> · {missing} outside the index</Text>}
        </Text>
        <Box gap={1}>
          <Button key="mem-analyze" variant="primary" label={audit.running ? 'analyzing…' : analyzed ? 're-analyze' : 'analyze'} hotkey="a" onPress={act.analyze} />
          <Button key="mem-mermaid" label="mermaid" onPress={act.mermaid} />
          <Button key="mem-refresh" plain label="↻" onPress={act.refresh} />
        </Box>
      </Box>
      {audit.running ? (
        <Text color="yellow">● checking {list.length} memories against the code, then Sonnet reads them with CLAUDE.md and the recent commits…</Text>
      ) : analyzed ? (
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>relevance {ago(now - audit.at)} ago: </Text>
            <Text color="green">✓ {counts.relevant} relevant</Text>
            <Text color="yellow">  ◐ {counts.stale} stale</Text>
            <Text color="red">  ✗ {counts.irrelevant} irrelevant</Text>
          </Text>
          {counts.irrelevant > 0 && <Button key="mem-del-irrelevant" plain label={`[delete ✗ ${counts.irrelevant}]`} onPress={() => act.remove(list.filter(m => v(m.name)?.verdict === 'irrelevant').map(m => m.name))} />}
        </Box>
      ) : (
        <Text dimColor wrap="wrap">Not analyzed yet: “analyze” checks what each memory names in the code, then asks Sonnet which still matter here and how to rewrite the stale ones. It only marks; fix and delete are clicks.</Text>
      )}
      {audit.note ? <Text wrap="wrap" color={audit.note.startsWith('✗') ? 'red' : 'yellow'}>{audit.note}</Text> : null}

      <Box marginTop={1} gap={1} flexWrap="wrap">
        {[['all', list.length] as [string, number], ...types.map(t => [t, list.filter(m => m.type === t).length] as [string, number])].map(([t, n]) => (
          <Button key={`mt-${t}`} label={`${t} ${n}`} variant={filter === t ? 'primary' : 'secondary'} onPress={() => act.filter(t)} />
        ))}
        {(['irrelevant', 'stale'] as const).filter(x => counts[x]).map(x => (
          <Button key={`mt-v-${x}`} label={`${VERDICT[x].mark} ${x} ${counts[x]}`} variant={filter === `v:${x}` ? 'primary' : 'secondary'} onPress={() => act.filter(`v:${x}`)} />
        ))}
      </Box>
      <Text dimColor wrap="wrap">├→ links to · ←n cited by · ✓ relevant ◐ stale ✗ irrelevant · gone: not in the code any more · ◉ read ↺ recalled ✎ written</Text>

      {types.map(t => {
        const group = list.filter(m => m.type === t && pass(m)).sort(order)
        if (!group.length) return null

        return (
          <Box key={`grp-${t}`} flexDirection="column" borderStyle="round" borderColor={TYPE_COLOR[t] ?? 'gray'} paddingX={1}>
            <Text wrap="truncate-end">
              <Text bold color={TYPE_COLOR[t]}>{t.toUpperCase()}</Text>
              <Text dimColor> {group.length} · {TYPE_SHORT[t] ?? 'no type: the model cannot tell when it applies'}</Text>
            </Text>
            {group.map(nodeView)}
          </Box>
        )
      })}

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>IN THE PROMPT</Text>
        {meta.context.map(f => (
          <Text key={`ctx-${f.path}`} wrap="truncate-end">
            <Text color="green">● </Text>
            <Text>{tail(f.path)}</Text>
            <Text dimColor> {f.type} · {k(f.tokens)} tok on every request</Text>
          </Text>
        ))}
        {meta.context.length === 0 && <Text dimColor>nothing from memory in context</Text>}
        <Text wrap="truncate-end">
          <Text color="cyan">◉ read {reads}</Text>
          <Text color="blue">  ↺ recalled {recalled}</Text>
          <Text color="yellow">  ✎ written {writes}</Text>
          {use[INDEX]?.read ? <Text dimColor>  (MEMORY.md read ×{use[INDEX]!.read})</Text> : null}
        </Text>
        {meta.remember.length > 0 && (
          <Text wrap="wrap" dimColor>
            <Text color="magenta">+ .remember </Text>
            {meta.remember.map(f => `${f.name} ${k(f.size)}`).join(' · ')} (remember plugin, at SessionStart)
          </Text>
        )}
      </Box>
    </Box>
  )
}
