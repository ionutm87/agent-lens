import type { Step, Worker } from '../types'
import { card, section, strip, tiles } from './kit'
import type { Fold } from './kit'
import { PET_COLORS, crabSvg, mmss, stepKind } from './extras'

// The Agents tab: every subagent of the chat as a card (a crab pet on the desktop), grouped Running, Finished,
// Stopped; each names the plan step it works for, what it does now and, folded, all its steps. Drawing only.

type Ui = { Box: any; Text: any; Button: any; Svg?: any }
type Data = { workers: Worker[]; steps: Step[]; now: number; fold: Fold; short: (model: string) => string; k: (n: number) => string; usd: (n: number) => string }

const toolName = (tool: string) => tool.replace(/^mcp__(?:plugin_)?(.+?)__/, '$1 · ')

export const agentsView = (ui: Ui, d: Data) => {
  const { Box, Text, Svg } = ui
  const own = (w: Worker) => d.steps.filter(s => s.agentId && s.agentId === w.agentId)
  const tokens = d.steps.filter(s => s.agentId).reduce((n, s) => n + s.tokensIn + s.tokensOut, 0)
  const cost = d.steps.filter(s => s.agentId).reduce((n, s) => n + (s.cost ?? 0), 0)
  const time = d.workers.reduce((n, w) => n + (w.durationMs ?? (w.status === 'running' ? d.now - w.startedAt : 0)), 0)
  const groups = [
    ['run', 'Running', 'green', d.workers.filter(w => w.status === 'running')],
    ['done', 'Finished', 'yellow', d.workers.filter(w => w.status === 'done')],
    ['stop', 'Stopped', 'red', d.workers.filter(w => w.status === 'aborted' || w.status === 'denied')],
  ] as const

  const workerCard = (w: Worker, i: number) => {
    const color = PET_COLORS[d.workers.indexOf(w) % PET_COLORS.length] ?? "#2563eb"
    const isRunning = w.status === 'running'
    const mine = own(w)
    const uses = mine.flatMap(s => s.uses ?? [])
    const lastUse = uses.at(-1)
    const spent = mine.reduce((n, s) => n + s.tokensIn + s.tokensOut, 0) || (w.tokensOut ?? 0)
    const key = `ag-${w.id}`
    const mark = isRunning ? ['●', 'green'] : w.status === 'done' ? ['✓', 'green'] : ['✗', 'red']

    return (
      <Box key={key} borderStyle="round" borderColor={isRunning ? 'blue' : 'gray'} paddingX={1} gap={1} marginTop={i ? 1 : 0}>
        {Svg && <Svg key={`${key}-pet`} source={crabSvg(color, isRunning)} alt={`${w.type} crab`} width={40} height={30} />}
        <Box flexDirection="column" flexGrow={1}>
          <Box justifyContent="space-between">
            <Text bold wrap="truncate-end">{w.description || w.type}</Text>
            <Text bold color={mark[1]}>{mark[0]}</Text>
          </Box>
          <Box justifyContent="space-between">
            <Text dimColor wrap="truncate-end">
              {w.type} · {d.short(w.model)}
              {w.isBackground ? ' · background' : ''}
            </Text>
            <Text dimColor>
              {d.k(spent)} · {mmss(w.durationMs ?? d.now - w.startedAt)}
            </Text>
          </Box>
          {w.planStep && <Text color="magenta" wrap="truncate-end">⤷ plan step · {w.planStep}</Text>}
          {isRunning ? (
            <Text color="yellow" bold wrap="truncate-end">
              ◐ Step {mine.length || 1}
              {lastUse ? ` · ${toolName(lastUse.tool)} ${lastUse.brief.replace(/\s+/g, ' ')}` : ' · starting'}
            </Text>
          ) : (
            <Text color={w.status === 'done' ? 'green' : 'red'}>
              {w.status === 'done' ? 'Done' : w.status === 'denied' ? 'Denied' : 'Stopped'} · {uses.length} tool{uses.length === 1 ? '' : 's'}
            </Text>
          )}
          {uses.length > 0 &&
            section(ui, d.fold, `${key}-steps`, isRunning ? `All ${uses.length} steps` : 'Steps', false, () => (
              <Box flexDirection="column">
                {uses.slice(-12).map((u, ui2) => {
                  const [kind, kc] = stepKind(u.tool)

                  return (
                    <Text key={`${key}-u-${ui2}`} wrap="truncate-end">
                      <Text color={kc}>{kind.padEnd(10)}</Text>
                      {u.brief.replace(/\s+/g, ' ')}
                    </Text>
                  )
                })}
              </Box>
            ))}
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {card(
        ui,
        groups[0][3].length ? 'yellow' : 'green',
        <>
          <Text bold color="yellow">
            {d.workers.length ? `${d.workers.length} subagent${d.workers.length > 1 ? 's' : ''} in this chat` : 'No subagents yet'}
          </Text>
          {tiles(ui, 'ag-tiles', [
            { label: 'tokens', value: d.k(tokens), color: 'yellow' },
            { label: 'cost', value: d.usd(cost), color: 'yellow' },
            { label: 'time', value: mmss(time), color: 'yellow' },
          ])}
        </>,
      )}
      {groups.map(([id, title, color, list]) =>
        list.length === 0 ? null : (
          <Box key={`grp-${id}`} flexDirection="column">
            {strip(ui, `strip-${id}`, color, `${title} · ${list.length}`)}
            {list.map(workerCard)}
          </Box>
        ),
      )}
      <Text dimColor wrap="wrap">Each card names the plan step it works for; the pane opens by itself when subagents start.</Text>
    </Box>
  )
}
