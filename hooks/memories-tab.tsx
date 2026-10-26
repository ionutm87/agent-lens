import type { Memory, MemoryAudit, MemoryMeta, MemoryUse, MemoryView } from '../types'
import { backlinks, isolated } from './memories'
import { card, needsYou, section, tiles } from './kit'
import type { Fold } from './kit'

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
// The analysis verdicts.
export const VERDICT = {
  irrelevant: { mark: '✗', color: 'red', rank: 0 },
  stale: { mark: '◐', color: 'yellow', rank: 1 },
  relevant: { mark: '✓', color: 'green', rank: 2 },
} as const
// One mark per memory, the verdict and the problems together: ✗ delete it, ◐ look at it, ✓ fine, · not checked yet.
const HEALTH = {
  drop: { mark: '✗', color: 'red', rank: 0 },
  look: { mark: '◐', color: 'yellow', rank: 1 },
  new: { mark: '·', color: undefined, rank: 2 },
  ok: { mark: '✓', color: 'green', rank: 3 },
} as const
const ago = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`)
const UNTYPED = 'untyped: no type in the frontmatter, so the model cannot tell when it applies.'
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const tail = (path: string) => path.split('/').slice(-2).join('/')
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export type MemoryData = { list: Memory[]; meta: MemoryMeta; use: Record<string, MemoryUse>; opened: MemoryView | null; audit: MemoryAudit; now: number; fold: Fold }
export type MemoryActions = { open: (name: string) => void; back: () => void; refresh: () => void; analyze: () => void; mermaid: (press: any) => void; fix: (name: string) => void; remove: (names: string[]) => void; unlink: (target: string) => void }
type Ui = { Box: any; Text: any; Button: any; Markdown: any } // ponytail: terminal elements, untyped here; register.tsx provides them from $.ui.resolve

export const memoriesView = (ui: Ui, { list, meta, use, opened, audit, now, fold }: MemoryData, act: MemoryActions) => {
  const { Box, Text, Button, Markdown } = ui
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

  const v = (name: string) => audit.verdicts[name]
  const broken = (m: Memory) => m.links.filter(l => !names.has(l))
  // What is wrong with a memory, in words; empty = nothing.
  const issues = (m: Memory) => {
    const verdict = v(m.name)

    return [
      verdict && verdict.verdict !== 'relevant' ? verdict.verdict : '',
      broken(m).length ? plural(broken(m).length, 'broken link') : '',
      verdict?.gone?.length ? 'names gone code' : '',
      m.indexed ? '' : 'outside MEMORY.md',
    ].filter(Boolean)
  }
  const health = (m: Memory) => (v(m.name)?.verdict === 'irrelevant' ? HEALTH.drop : issues(m).length ? HEALTH.look : v(m.name) ? HEALTH.ok : HEALTH.new)

  // An open memory: where it stands and what to do, then what it says, its neighbors and how it was used.
  const node = opened && list.find(m => m.name === opened.name)
  if (opened && node) {
    const out = node.links
    const inc = back[node.name] ?? []
    const u = use[node.name]
    const verdict = v(node.name)
    const look = health(node)
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
      <Box flexDirection="column" gap={1}>
        {card(
          ui,
          look.color ?? 'blue',
          <>
            <Box justifyContent="space-between">
              <Text bold color={look.color} wrap="truncate-end">
                {look.mark} {node.name}
              </Text>
              <Button key="mem-back" plain label="← all" hotkey="b" onPress={act.back} />
            </Box>
            <Text dimColor wrap="wrap">{node.description}</Text>
            <Text wrap="wrap" color={TYPE_COLOR[node.type]}>{TYPE_HELP[node.type] ?? UNTYPED}</Text>
            {verdict && (
              <Text wrap="wrap">
                <Text color={VERDICT[verdict.verdict].color}>{VERDICT[verdict.verdict].mark} {verdict.verdict}</Text>
                <Text dimColor> · {verdict.why}</Text>
              </Text>
            )}
            {verdict?.gone?.length ? <Text wrap="wrap" color="red">gone from the code: {verdict.gone.map(r => `\`${r}\``).join(', ')}</Text> : null}
            <Text wrap="wrap">
              <Text dimColor>in the prompt (MEMORY.md): </Text>
              {node.indexed ? <Text>„{node.hook}”</Text> : <Text color="red">missing from the index: the model sees it only if it looks for it</Text>}
            </Text>
            <Text dimColor>
              this session: read {u?.read ?? 0} · written {u?.write ?? 0} · recalled {u?.recalled ?? 0}
            </Text>
          </>,
        )}
        {verdict && verdict.verdict !== 'relevant' &&
          needsYou(
            ui,
            verdict.fix ? 'apply the fix or delete' : 'delete or keep',
            <Box gap={1}>
              {verdict.fix ? <Button key={`mem-fix-${node.name}`} variant="primary" label="apply the fix" onPress={() => act.fix(node.name)} /> : null}
              <Button key={`mem-del-${node.name}`} label="delete" onPress={() => act.remove([node.name])} />
            </Box>,
            'unanswered = the memory stays as it is',
          )}
        {verdict?.fix ? section(ui, fold, 'mv-fix', 'Proposed fix · replaces the body, keeps the frontmatter', true, () => <Markdown text={verdict.fix!} />) : null}
        {section(ui, fold, 'mv-links', 'Links', true, () => (
          <Box flexDirection="column">
            <Text dimColor>links to → {out.length}</Text>
            {out.map((n, i) => edge(n, i, out, 'out'))}
            <Text dimColor>cited by ← {inc.length}</Text>
            {inc.map((n, i) => edge(n, i, inc, 'in'))}
          </Box>
        ))}
        {section(ui, fold, 'mv-body', 'What it says', true, () => <Markdown text={opened.body} />)}
      </Box>
    )
  }

  const analyzed = Object.keys(audit.verdicts).length > 0
  const types = [...new Set([...TYPE_ORDER.filter(t => list.some(m => m.type === t)), ...list.map(m => m.type)])]
  const degree = (m: Memory) => (back[m.name]?.length ?? 0) + m.links.length
  const order = (a: Memory, b: Memory) => health(a).rank - health(b).rank || degree(b) - degree(a) || a.name.localeCompare(b.name)
  const count = (h: (typeof HEALTH)[keyof typeof HEALTH]) => list.filter(m => health(m) === h).length
  const reads = Object.entries(use).filter(([n, u]) => n !== INDEX && u.read).length
  const writes = Object.values(use).reduce((n, u) => n + u.write, 0)
  const recalled = Object.entries(use).filter(([, u]) => u.recalled).length
  const promptTokens = meta.context.reduce((n, f) => n + f.tokens, 0)

  // The decisions, one per row: a link to a memory that does not exist (grouped by target, so one press fixes
  // every memory citing it), what Sonnet flagged, code that is gone, a memory the index does not list.
  const missing = [...new Set(list.flatMap(broken))].map(to => ({ to, by: list.filter(m => m.links.includes(to)).map(m => m.name) }))
  const flagged = list.filter(m => v(m.name) && v(m.name)!.verdict !== 'relevant').sort(order)
  const goneOnly = list.filter(m => v(m.name)?.verdict === 'relevant' && v(m.name)?.gone?.length)
  const unindexed = list.filter(m => !m.indexed)
  const irrelevant = list.filter(m => v(m.name)?.verdict === 'irrelevant').map(m => m.name)
  const decisions = missing.length + flagged.length + goneOnly.length + unindexed.length
  const row = (key: string, mark: string, color: string, text: any, buttons: any) => (
    <Box key={key} justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text color={color}>{mark} </Text>
        {text}
      </Text>
      <Box flexShrink={0} gap={1}>
        {buttons}
      </Box>
    </Box>
  )

  // One memory, two lines: the mark, the name (press = open), who cites it and what is wrong; its description under it.
  const memoryRow = (m: Memory) => {
    const look = health(m)
    const inN = back[m.name]?.length ?? 0
    const wrong = issues(m)

    return (
      <Box key={`mem-${m.name}`} flexDirection="column">
        <Box>
          <Text color={look.color} dimColor={!look.color}>{look.mark} </Text>
          <Button key={`mo-${m.name}`} plain label={m.name} onPress={open(m.name)} />
          <Text mono size="footnote" wrap="truncate-end">
            {inN > 0 && <Text color="cyan">{`  ←${inN}`}</Text>}
            {lonely.includes(m.name) && <Text dimColor>  isolated</Text>}
            {wrong.length > 0 && <Text color={look.color}>  {wrong.join(' · ')}</Text>}
            <Text color="green">{marks(m.name)}</Text>
          </Text>
        </Box>
        <Text mono size="footnote" wrap="truncate-end" dimColor>
          {'  '}
          {v(m.name) && v(m.name)!.verdict !== 'relevant' ? v(m.name)!.why : m.description || m.hook}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {card(
        ui,
        'green',
        <>
          <Box justifyContent="space-between">
            <Text weight="semibold" color="green">Memories</Text>
            <Box gap={1}>
              <Text dimColor size="caption">{edges} links · {lonely.length} isolated</Text>
              <Button key="mem-refresh" plain label="↻" onPress={act.refresh} />
            </Box>
          </Box>
          {tiles(ui, 'mem-tiles', [
            { label: 'memories', value: String(list.length) },
            { label: '✓ fine', value: String(count(HEALTH.ok)), color: 'green' },
            { label: '◐ look at', value: String(count(HEALTH.look)), color: count(HEALTH.look) ? 'yellow' : undefined },
            { label: '✗ delete', value: String(count(HEALTH.drop)), color: count(HEALTH.drop) ? 'red' : undefined },
          ])}
          {audit.running ? (
            <Text color="yellow" wrap="wrap">● checking {list.length} memories against the code, then Sonnet reads them with CLAUDE.md and the recent commits…</Text>
          ) : analyzed ? (
            <Text dimColor>checked {ago(now - audit.at)} ago: the code, then Sonnet</Text>
          ) : (
            <Text dimColor wrap="wrap">Not analyzed yet: “analyze” checks what each memory names in the code, then asks Sonnet which still matter here. It only marks; fix and delete are presses.</Text>
          )}
          <Box gap={1}>
            <Button key="mem-analyze" variant="primary" label={audit.running ? 'analyzing…' : analyzed ? 're-analyze' : 'analyze'} hotkey="a" onPress={act.analyze} />
            <Button key="mem-mermaid" label="copy as mermaid" onPress={act.mermaid} />
          </Box>
          {audit.note ? <Text wrap="wrap" color={audit.note.startsWith('✗') ? 'red' : 'yellow'}>{audit.note}</Text> : null}
        </>,
      )}

      {decisions > 0 &&
        needsYou(
          ui,
          plural(decisions, 'decision'),
          <>
            {missing.map(({ to, by }) =>
              row(
                `mn-${to}`,
                '✗',
                'red',
                <Text>
                  [[{to}]] <Text dimColor>does not exist · cited by {by.join(', ')}</Text>
                </Text>,
                <Button key={`mu-${to}`} plain label={`[unlink ×${by.length}]`} onPress={() => act.unlink(to)} />,
              ),
            )}
            {flagged.map(m =>
              row(
                `mf-row-${m.name}`,
                VERDICT[v(m.name)!.verdict].mark,
                VERDICT[v(m.name)!.verdict].color,
                <Text>
                  {m.name} <Text dimColor>{v(m.name)!.verdict}: {v(m.name)!.why}</Text>
                </Text>,
                <>
                  {v(m.name)!.fix ? <Button key={`mf-${m.name}`} plain label="[fix]" onPress={() => act.fix(m.name)} /> : null}
                  <Button key={`md-${m.name}`} plain label="[delete]" onPress={() => act.remove([m.name])} />
                </>,
              ),
            )}
            {goneOnly.map(m =>
              row(
                `mg-row-${m.name}`,
                '?',
                'yellow',
                <Text>
                  {m.name} <Text dimColor>names code not found: {v(m.name)!.gone!.map(r => `\`${r}\``).join(' ')} (Sonnet still finds it relevant)</Text>
                </Text>,
                <Button key={`mg-${m.name}`} plain label="[open]" onPress={open(m.name)} />,
              ),
            )}
            {unindexed.map(m =>
              row(
                `mi-row-${m.name}`,
                '!',
                'yellow',
                <Text>
                  {m.name} <Text dimColor>outside the index: the model sees it only if it looks for it</Text>
                </Text>,
                <Button key={`mi-${m.name}`} plain label="[open]" onPress={open(m.name)} />,
              ),
            )}
            {irrelevant.length > 1 && <Button key="mem-del-irrelevant" plain label={`[delete all ✗ ${irrelevant.length}]`} onPress={() => act.remove(irrelevant)} />}
          </>,
          'unlink keeps the word and drops the [[ ]] · unanswered = nothing changes',
        )}

      {types.map(t => {
        const group = list.filter(m => m.type === t).sort(order)
        const bad = group.filter(m => health(m) === HEALTH.look || health(m) === HEALTH.drop).length

        return section(
          ui,
          fold,
          `mem-${t}`,
          `${t[0]!.toUpperCase()}${t.slice(1)} · ${TYPE_SHORT[t] ?? 'no type: the model cannot tell when it applies'}`,
          true,
          () => <Box flexDirection="column">{group.map(memoryRow)}</Box>,
          <Text color={bad ? 'yellow' : TYPE_COLOR[t]} dimColor={!bad}>{bad ? `${bad} to look at · ${group.length}` : group.length}</Text>,
        )
      })}

      {section(
        ui,
        fold,
        'mem-prompt',
        'In the prompt',
        false,
        () => (
          <Box flexDirection="column">
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
            <Text wrap="truncate-start" dimColor>{meta.dir}</Text>
          </Box>
        ),
        <Text dimColor>{k(promptTokens)} tok / request</Text>,
      )}
      <Text dimColor wrap="wrap">✓ fine ◐ look at it ✗ delete · not checked · ←n cited by · press a name to open it</Text>
    </Box>
  )
}
