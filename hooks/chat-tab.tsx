import type { EditRec, FileTouch, Plan } from '../types'
import { card, section, tiles } from './kit'
import type { Fold } from './kit'
import { connectorsOf } from './extras'

// The Chat tab: what this chat used (tools, connectors, files, skills), the plan as a to-do (the same plan as
// Flow) and the last turn's edits, replayed one by one. Drawing only.

type Ui = { Box: any; Text: any; Button: any; Code: any }
type Data = { counts: Record<string, number>; skills: Record<string, number>; files: FileTouch[]; edits: EditRec[]; editIdx: number; plan: Plan | null; fold: Fold }
type Acts = { step: (by: number) => void; replay: () => void }

const MARK = { todo: ['○', undefined], run: ['●', 'yellow'], done: ['✓', 'green'], skip: ['⊘', undefined] } as const

const where = (path: string) => {
  const i = path.lastIndexOf('/')

  return i < 0 ? ['', path] : [path.slice(0, i).replace(/^\/home\/[^/]+/, '~'), path.slice(i + 1)]
}

// One edit as a diff: its old lines out, its new lines in (a Write: only in).
export const editDiff = (e: EditRec, max = 8) => {
  const lines = (text: string, sign: string) => (text ? text.split('\n').slice(0, max).map(l => `${sign} ${l}`) : [])

  return [...lines(e.old, '-'), ...lines(e.new, '+')].join('\n')
}

export const chatView = (ui: Ui, d: Data, act: Acts) => {
  const { Box, Text, Button, Code } = ui
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

  return (
    <Box flexDirection="column" gap={1}>
      {card(
        ui,
        'green',
        <>
          <Text bold color="green">In this chat</Text>
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
              <Text key={`td-${s.id}`} wrap="truncate-end">
                <Text color={MARK[s.status][1]} bold={s.status === 'run'}>{MARK[s.status][0]} </Text>
                <Text dimColor={s.status === 'done' || s.status === 'skip'} bold={s.status === 'run'}>{s.title}</Text>
              </Text>
            ))}
          </Box>
        ), <Text dimColor>{done}/{steps.length} · same plan as Flow</Text>)}
      {connectors.length > 0 &&
        section(ui, d.fold, 'chat-conn', 'Connectors', true, () => (
          <Box flexDirection="column">
            {connectors.map(c => (
              <Box key={`cn-${c.server}`} justifyContent="space-between">
                <Text bold>{c.server}</Text>
                <Text dimColor wrap="truncate-end">
                  {Object.entries(c.tools).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(' · ')}
                </Text>
              </Box>
            ))}
          </Box>
        ), <Text dimColor>{connectors.length} · {connectors.reduce((n, c) => n + c.calls, 0)} calls</Text>)}
      {d.files.length > 0 &&
        section(ui, d.fold, 'chat-files', 'Files', true, () => (
          <Box flexDirection="column">
            {d.files.slice(-8).reverse().map(f => {
              const [dir, name] = where(f.path)

              return (
                <Text key={`fl-${f.path}`} wrap="truncate-end">
                  <Text color={f.wrote ? 'yellow' : 'green'}>{(f.wrote ? 'wrote' : 'read').padEnd(6)}</Text>
                  {name} <Text dimColor>{dir}</Text>
                </Text>
              )
            })}
            {d.files.length > 8 && <Text dimColor>… {d.files.length - 8} more</Text>}
          </Box>
        ), <Text dimColor>{read} read · {wrote} written</Text>)}
      {shown &&
        card(
          ui,
          'gray',
          <>
            <Box justifyContent="space-between">
              <Text bold>Last turn's edits</Text>
              <Text dimColor>
                {turnEdits.length} edit{turnEdits.length === 1 ? '' : 's'} · {new Set(turnEdits.map(e => e.path)).size} files
              </Text>
            </Box>
            <Box gap={1}>
              <Button key="replay" label="▶ replay" onPress={act.replay} />
              <Button key="edit-prev" plain label="◀" onPress={() => act.step(-1)} />
              <Text dimColor>{idx + 1}/{turnEdits.length}</Text>
              <Button key="edit-next" plain label="▶" onPress={() => act.step(1)} />
              <Text wrap="truncate-start">{where(shown.path)[1]}</Text>
            </Box>
            <Code source={editDiff(shown)} format="diff" wrap="truncate-end" />
          </>,
        )}
      {skills.length > 0 &&
        section(ui, d.fold, 'chat-skills', 'Skills', true, () => (
          <Box flexDirection="column">
            {skills.map(([n, c]) => (
              <Text key={`sk-${n}`}>
                <Text color="blue">✦ </Text>
                {n} <Text dimColor>×{c}</Text>
              </Text>
            ))}
          </Box>
        ), <Text dimColor>{skills.length}</Text>)}
      {section(ui, d.fold, 'chat-tools', 'Tools by count', false, () => <Text wrap="wrap">{byCount.slice(0, 16).map(([n, c]) => `${n} ${c}`).join(' · ') || '—'}</Text>, <Text dimColor wrap="truncate-end">{byCount.slice(0, 3).map(([n, c]) => `${n} ${c}`).join(' · ')}</Text>)}
    </Box>
  )
}
