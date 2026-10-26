import type { EditRec, FileTouch, Plan } from '../types'
import { card, section, tiles } from './kit'
import type { Fold } from './kit'
import { connectorsOf } from './extras'

// The Chat tab: what this chat used (tools, connectors, files, skills), the plan as a to-do (the same plan as
// Flow) and the last turn's edits, replayed one by one. Drawing only.

type Ui = { Box: any; Text: any; Button: any; Svg?: any }
type Data = { counts: Record<string, number>; skills: Record<string, number>; files: FileTouch[]; edits: EditRec[]; editIdx: number; plan: Plan | null; fold: Fold }
type Acts = { step: (by: number) => void; replay: () => void }

const MARK = { todo: ['○', 'gray'], run: ['●', 'yellow'], done: ['✓', 'green'], skip: ['⊘', 'gray'] } as const
const SHOWN_FILES = 6

// A connector's badge color, by its name: hex on the desktop (a rounded square), the nearest color name on the terminal.
const BADGE = [
  ['#16a34a', 'green'],
  ['#D97757', 'red'],
  ['#0e7490', 'cyan'],
  ['#57534e', 'gray'],
  ['#7c3aed', 'magenta'],
  ['#2563eb', 'blue'],
] as const
const badgeOf = (server: string) => BADGE[[...server].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BADGE.length]!
const wordsOf = (server: string) => server.split(/[-_\s]+/).filter(Boolean)
const initials = (server: string) => wordsOf(server).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
const nameOf = (server: string) => wordsOf(server).map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')
const badgeSvg = (fill: string, text: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="5" fill="${fill}"/><text x="9" y="12.5" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="${text.length > 1 ? 8.5 : 10}" font-weight="700" fill="#fff">${text}</text></svg>`

// "/home/me/.claude/mods/agent-lens/hooks/kit.tsx" → ["…/agent-lens/hooks", "kit.tsx"]: the folder kept short.
const where = (path: string) => {
  const i = path.lastIndexOf('/')
  if (i < 0) return ['', path]
  const parts = path.slice(0, i).replace(/^\/home\/[^/]+/, '~').split('/')

  return [parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : parts.join('/'), path.slice(i + 1)]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// One edit as a diff: its old lines out, its new lines in (a Write: only in).
export const editDiff = (e: EditRec, max = 8) => {
  const lines = (text: string, sign: string) => (text ? text.split('\n').slice(0, max).map(l => `${sign} ${l}`) : [])

  return [...lines(e.old, '-'), ...lines(e.new, '+')].join('\n')
}

export const chatView = (ui: Ui, d: Data, act: Acts) => {
  const { Box, Text, Button, Svg } = ui
  // Every surface's table carries every element name (a missing one draws an empty Box), so `Svg` is always
  // there: only the desktop's builds a real one.
  const isDesk = Svg?.({ source: '<svg xmlns="http://www.w3.org/2000/svg"/>', alt: '' })?.type === 'Svg'
  // One color on both surfaces: the mockup's hex on the desktop, the nearest name on the terminal.
  const tint = (hex: string, name: string) => (isDesk ? hex : name)
  const connectors = connectorsOf(d.counts)
  const calls = Object.values(d.counts).reduce((n, v) => n + v, 0)
  const skills = Object.entries(d.skills).sort((a, b) => b[1] - a[1])
  const lastAt = d.edits.at(-1)?.at
  const turnEdits = d.edits.filter(e => e.at === lastAt)
  const idx = Math.min(Math.max(0, d.editIdx), Math.max(0, turnEdits.length - 1))
  const shown = turnEdits[idx]
  const read = d.files.filter(f => f.read).length
  const wrote = d.files.filter(f => f.wrote).length
  const steps = d.plan?.steps ?? []
  const done = steps.filter(s => s.status === 'done' || s.status === 'skip').length
  const byCount = Object.entries(d.counts).sort((a, b) => b[1] - a[1])
  const aside = (text: string) => <Text dimColor size="caption" wrap="truncate-end">{text}</Text>

  return (
    <Box flexDirection="column" gap={1}>
      {card(
        ui,
        'green',
        <>
          <Text weight="semibold" color={tint('#15803d', 'green')}>In this chat</Text>
          {tiles(ui, 'chat-tiles', [
            { label: 'tools', value: String(calls) },
            { label: 'connectors', value: String(connectors.length) },
            { label: 'files', value: String(d.files.length) },
            { label: 'skills', value: String(skills.length) },
          ])}
        </>,
      )}
      {steps.length > 0 &&
        section(ui, d.fold, 'chat-todo', 'To-do', true, () => (
          <Box flexDirection="column">
            {steps.map(s => (
              <Text key={`td-${s.id}`} mono size="footnote" wrap="truncate-end">
                <Text color={MARK[s.status][1]} weight={s.status === 'run' ? 'bold' : undefined}>{MARK[s.status][0]} </Text>
                <Text dimColor={s.status === 'done' || s.status === 'skip'} weight={s.status === 'run' ? 'bold' : undefined}>{s.title}</Text>
              </Text>
            ))}
          </Box>
        ), aside(`${done}/${steps.length} · same plan as Flow`))}
      {connectors.length > 0 &&
        section(ui, d.fold, 'chat-conn', 'Connectors', true, () => (
          <Box flexDirection="column" gap={isDesk ? 'xs' : 0}>
            {connectors.map(c => {
              const [hex, name] = badgeOf(c.server)
              const mark = initials(c.server)
              const tools = Object.entries(c.tools).sort((a, b) => b[1] - a[1]).slice(0, 2)

              return (
                <Box key={`cn-${c.server}`} gap={1} alignItems="center">
                  {isDesk ? <Svg source={badgeSvg(hex, mark)} alt={mark} width={18} height={18} /> : <Text bold color={name}>{mark.padEnd(2)}</Text>}
                  <Box flexGrow={1}>
                    <Text mono size="footnote" wrap="truncate-end">{nameOf(c.server)}</Text>
                  </Box>
                  <Text mono size="footnote" dimColor wrap="truncate-end">{tools.map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(' · ')}</Text>
                </Box>
              )
            })}
          </Box>
        ), aside(`${connectors.length} · ${connectors.reduce((n, c) => n + c.calls, 0)} calls`))}
      {d.files.length > 0 &&
        section(ui, d.fold, 'chat-files', 'Files', true, () => (
          <Box flexDirection="column">
            {d.files.slice(-SHOWN_FILES).reverse().map(f => {
              const [dir, name] = where(f.path)

              return (
                <Text key={`fl-${f.path}`} mono size="footnote" wrap="truncate-end">
                  <Text color={f.wrote ? tint('#c2410c', 'yellow') : tint('#15803d', 'green')}>{(f.wrote ? 'wrote' : 'read').padEnd(7)}</Text>
                  {name} <Text dimColor>{dir}</Text>
                </Text>
              )
            })}
            {d.files.length > SHOWN_FILES && <Text mono size="footnote" dimColor>… {d.files.length - SHOWN_FILES} more</Text>}
          </Box>
        ), aside(`${read} read · ${wrote} written`))}
      {shown &&
        card(
          ui,
          'gray',
          <Box flexDirection="column" gap={isDesk ? 'xs' : 0}>
            <Box justifyContent="space-between">
              <Text weight="semibold">Last turn's edits</Text>
              {aside(`${plural(turnEdits.length, 'edit')} · ${plural(new Set(turnEdits.map(e => e.path)).size, 'file')}`)}
            </Box>
            <Box gap={1} alignItems="center">
              <Button key="replay" variant="primary" label="▶ replay" onPress={act.replay} />
              <Button key="edit-prev" plain dimColor label="◀" onPress={() => act.step(-1)} />
              <Text dimColor tabular>{idx + 1}/{turnEdits.length}</Text>
              <Button key="edit-next" plain dimColor label="▶" onPress={() => act.step(1)} />
              <Box flexGrow={1}>
                <Text mono size="footnote" wrap="truncate-start">{where(shown.path)[1]}</Text>
              </Box>
            </Box>
            <Box flexDirection="column">
              {editDiff(shown).split('\n').map((line, i) => {
                const isOut = line.startsWith('-')

                return (
                  <Box key={`df-${i}`} backgroundColor={isDesk ? (isOut ? '#fef2f2' : '#f0fdf4') : undefined} paddingX={isDesk ? 1 : 0}>
                    <Text mono size="footnote" color={isOut ? tint('#991b1b', 'red') : tint('#166534', 'green')} wrap="truncate-end">{line}</Text>
                  </Box>
                )
              })}
            </Box>
          </Box>,
        )}
      {skills.length > 0 &&
        section(ui, d.fold, 'chat-skills', 'Skills', true, () => (
          <Box flexDirection="column">
            {skills.map(([n, c]) => (
              <Text key={`sk-${n}`} mono size="footnote">
                <Text color={tint('#1d4ed8', 'blue')}>✦ </Text>
                {n} <Text dimColor>×{c}</Text>
              </Text>
            ))}
          </Box>
        ), aside(String(skills.length)))}
      {section(
        ui,
        d.fold,
        'chat-tools',
        'Tools by count',
        false,
        () => <Text mono size="footnote" wrap="wrap">{byCount.slice(0, 16).map(([n, c]) => `${n} ${c}`).join(' · ') || '—'}</Text>,
        aside(`${byCount.slice(0, 3).map(([n, c]) => `${n} ${c}`).join(' · ')}${byCount.length > 3 ? ' …' : ''}`),
      )}
    </Box>
  )
}
