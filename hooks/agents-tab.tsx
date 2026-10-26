import type { Step, Worker } from '../types'
import type { Fold } from './kit'
import { PET_COLORS, crabSvg, mmss, stepKind } from './extras'

// The Agents tab: every subagent of the chat as a card (a crab pet on the desktop), grouped Running, Finished,
// Stopped; each names the plan step it works for, what it does now and, folded, all its steps. Drawing only.

type Ui = { Box: any; Text: any; Button: any; Svg?: any }
type Data = { workers: Worker[]; steps: Step[]; now: number; fold: Fold; short: (model: string) => string; k: (n: number) => string; usd: (n: number) => string }
type Use = { tool: string; brief: string }

// The mockup's palette on the desktop, color names on the terminal.
const HEX: Record<string, string> = { green: '#16a34a', yellow: '#eab308', red: '#dc2626', blue: '#2563eb', magenta: '#db2777', gray: '#78716c', orange: '#c2410c' }
const KIND_HEX: Record<string, string> = { green: '#15803d', yellow: '#ca8a04', blue: '#2563eb', magenta: '#db2777', gray: '#78716c' }

// "mcp__codegraph__codegraph_explore" → "codegraph · explore"
const toolName = (tool: string) => {
  const m = /^mcp__(?:plugin_)?(.+?)__(.+)$/.exec(tool)
  if (!m) return tool
  const [, server = '', name = ''] = m

  return `${server} · ${name.startsWith(`${server}_`) ? name.slice(server.length + 1) : name}`
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const isPath = (s: string) => /^(~|\.{0,2}\/)\S*$/.test(s)
const home = (s: string) => s.replace(/^\/(?:home|Users)\/[^/]+/, '~')
const tail = (p: string) => p.split('/').filter(Boolean).slice(-2).join('/')

// What the subagent does with a tool, in words: "Reading chat/register.tsx", "Searching files for "x"".
const doing = (u: Use) => {
  const b = oneLine(u.brief)
  const what = isPath(b) ? tail(b) : b
  if (u.tool === 'Read') return `Reading ${what}`
  if (u.tool === 'Grep' || u.tool === 'Glob') return `Searching files for "${b}"`
  if (u.tool === 'Bash') return `Running ${b}`
  if (/^(Edit|Write|NotebookEdit)$/.test(u.tool)) return `Editing ${what}`
  if (u.tool.startsWith('mcp__')) return toolName(u.tool)

  return `${u.tool} ${b}`.trim()
}

// "haiku-5-5" → "Haiku 5.5"
const nice = (short: string) => short.replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/^\w/, c => c.toUpperCase())

// The card's progress bar (desktop): a lit segment sliding along the track while it runs, full when done.
const progressSvg = (color: string, state: 'run' | 'done' | 'stop', phase: number) => {
  const w = 350
  const h = 10
  const sparks = (xs: number[]) => `<g fill="#fff">${xs.map((x, i) => `<rect x="${x}" y="${[2, 6, 3, 7, 4, 2][i % 6]}" width="1.6" height="1.6"/>`).join('')}</g>`
  const x = 20 + ((phase * 37) % 200)
  const body =
    state === 'run'
      ? `<rect width="${w}" height="${h}" fill="${color}" opacity=".16"/><rect x="${x}" width="122" height="${h}" fill="url(#p)"/>${sparks([x + 80, x + 96, x + 110, x + 116])}`
      : state === 'done'
        ? `<rect width="${w}" height="${h}" fill="url(#f)"/>${sparks([40, 120, 200, 260, 300, 330])}`
        : `<rect width="${w}" height="${h}" fill="${HEX.red}" opacity=".16"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="p" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".7" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".9"/></linearGradient><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}"/></linearGradient><clipPath id="c"><rect width="${w}" height="${h}" rx="5"/></clipPath></defs><g clip-path="url(#c)">${body}</g></svg>`
}

export const agentsView = (ui: Ui, d: Data) => {
  const { Box, Text, Button, Svg } = ui
  const desk = Boolean(Svg)
  const col = (name: string) => (desk ? (HEX[name] ?? name) : name)
  const own = (w: Worker) => d.steps.filter(s => s.agentId && s.agentId === w.agentId)
  const tokens = d.steps.filter(s => s.agentId).reduce((n, s) => n + s.tokensIn + s.tokensOut, 0)
  const cost = d.steps.filter(s => s.agentId).reduce((n, s) => n + (s.cost ?? 0), 0)
  const time = d.workers.reduce((n, w) => n + (w.durationMs ?? (w.status === 'running' ? d.now - w.startedAt : 0)), 0)
  const groups = [
    ['run', 'Running', 'green', d.workers.filter(w => w.status === 'running')],
    ['done', 'Finished', 'yellow', d.workers.filter(w => w.status === 'done')],
    ['stop', 'Stopped', 'red', d.workers.filter(w => w.status === 'aborted' || w.status === 'denied')],
  ] as const
  const isGroupOpen = (id: string) => d.fold.isOpen(`ag-grp-${id}`, id !== 'stop')
  const isHidden = d.fold.isOpen('ag-hide', false)
  const dots = ['●∙∙', '∙●∙', '∙∙●'][Math.floor(d.now / 1000) % 3]

  // Compact tiles: a caption label over a bold number, orange as in the mockup.
  const tile = (label: string, value: string) => (
    <Box key={`ag-tile-${label}`} flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text dimColor size="caption" wrap="truncate-end">{label}</Text>
      <Text weight="bold" mono size="footnote" tabular color={col('orange')} wrap="truncate-end">{value}</Text>
    </Box>
  )

  // The colored group heading, a fold: a full-width bar on the desktop, an inverse label on the terminal.
  const strip = (id: string, title: string, color: string, count: number) => {
    const key = `ag-grp-${id}`
    const open = isGroupOpen(id)
    const ink = color === 'yellow' ? (desk ? '#1c1917' : 'black') : desk ? '#ffffff' : 'white'

    return (
      <Box key={`strip-${id}`} backgroundColor={col(color)} paddingX={desk ? 1 : 0}>
        <Button key={`fold-${key}`} plain onPress={() => d.fold.toggle(key, !open)}>
          <Text weight="bold" color={ink} backgroundColor={desk ? undefined : color}>{` ${open ? '▾' : '▸'} ${title} · ${count} `}</Text>
        </Button>
      </Box>
    )
  }

  // One line of the folded list: the kind column colored, the file name, its folder dim.
  const stepRow = (key: string, u: Use) => {
    const [kind, kc] = stepKind(u.tool)
    const b = oneLine(u.brief)
    const [label, where] = u.tool.startsWith('mcp__') ? [toolName(u.tool), ''] : isPath(b) ? [b.split('/').pop() || b, home(b.split('/').slice(0, -1).join('/'))] : [b, '']

    return (
      <Text key={key} mono size="footnote" wrap="truncate-end">
        <Text color={desk ? (KIND_HEX[kc] ?? kc) : kc}>{kind.padEnd(10)}</Text>
        {label}
        {where ? <Text dimColor>{` ${where}`}</Text> : null}
      </Text>
    )
  }

  const workerCard = (w: Worker) => {
    const color = PET_COLORS[d.workers.indexOf(w) % PET_COLORS.length] ?? HEX.blue!
    const isRunning = w.status === 'running'
    const mine = own(w)
    const uses = mine.flatMap(s => s.uses ?? [])
    const spent = mine.reduce((n, s) => n + s.tokensIn + s.tokensOut, 0) || (w.tokensOut ?? 0)
    const effort = [...mine].reverse().find(s => s.effort)?.effort
    const key = `ag-${w.id}`
    const [mark, markColor] = isRunning ? ['●', 'green'] : w.status === 'done' ? ['✓', 'green'] : ['✗', 'red']
    const n = uses.length
    const steps = `${n} step${n === 1 ? '' : 's'}`
    const isOpen = d.fold.isOpen(`${key}-steps`, false)
    const last = uses.at(-1)
    const status = isRunning
      ? `◐ Step ${n || 1} · ${last ? doing(last) : 'starting'}`
      : `${w.status === 'done' ? 'Done' : w.status === 'denied' ? 'Denied' : 'Stopped'} · ${steps}`
    // Under the running step its two previous actions; under a finished card the last one.
    const earlier = isRunning ? uses.slice(-3, -1).reverse() : uses.slice(-1)

    return (
      <Box key={key} borderStyle="round" borderColor={isRunning ? col('blue') : desk ? '#d6d3d1' : 'gray'} paddingX={1} gap={1}>
        {Svg && <Svg key={`${key}-pet`} source={crabSvg(color, isRunning)} alt={`Claude crab, ${w.type}`} width={48} height={36} />}
        <Box flexDirection="column" flexGrow={1}>
          <Box justifyContent="space-between" gap={1}>
            <Text weight="bold" wrap="truncate-end">{w.description || w.type}</Text>
            <Text weight="bold" color={col(markColor)}>{mark}</Text>
          </Box>
          <Box justifyContent="space-between" gap={1}>
            <Text dimColor mono size="footnote" wrap="truncate-end">
              {[w.type, nice(d.short(w.model)), effort, w.isBackground ? 'background' : ''].filter(Boolean).join(' · ')}
            </Text>
            <Text dimColor mono size="footnote" tabular>
              {`${d.k(spent)} · ${mmss(w.durationMs ?? d.now - w.startedAt)}`}
            </Text>
          </Box>
          {w.planStep && <Text color={col('magenta')} mono size="footnote" wrap="truncate-end">{`⤷ plan step · ${w.planStep}`}</Text>}
          <Box flexDirection="column" marginTop={1}>
            <Text mono size="footnote" wrap="truncate-end" color={isRunning ? col('orange') : w.status === 'done' ? (desk ? '#15803d' : 'green') : col('red')}>
              <Text weight="bold">{status}</Text>
              {isRunning ? <Text dimColor>{` ${dots}`}</Text> : null}
            </Text>
            {earlier.map((u, i) => (
              <Text key={`${key}-was-${i}`} dimColor mono size="footnote" wrap="truncate-end">{`  ${doing(u)}`}</Text>
            ))}
          </Box>
          {Svg && <Svg key={`${key}-bar`} source={progressSvg(color, isRunning ? 'run' : w.status === 'done' ? 'done' : 'stop', Math.floor(d.now / 1000))} alt={status} />}
          {n > 0 && (
            <Box key={`sec-${key}-steps`} flexDirection="column">
              <Button key={`fold-${key}-steps`} plain dimColor label={isOpen ? '▾ Hide steps' : `▸ All ${steps}`} onPress={() => d.fold.toggle(`${key}-steps`, !isOpen)} />
              {isOpen && <Box flexDirection="column">{uses.slice(-12).map((u, i) => stepRow(`${key}-u-${i}`, u))}</Box>}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={desk ? '#ca8a04' : 'yellow'} paddingX={1} gap={isHidden ? 0 : 1}>
        <Box justifyContent="space-between" gap={1}>
          <Text weight="bold" color={desk ? '#a16207' : 'yellow'} wrap="truncate-end">
            {d.workers.length ? `${d.workers.length} subagent${d.workers.length > 1 ? 's' : ''} in this chat` : 'No subagents yet'}
          </Text>
          <Button key="ag-hide" plain dimColor label={isHidden ? '[show]' : '[hide]'} onPress={() => d.fold.toggle('ag-hide', !isHidden)} />
        </Box>
        {!isHidden && (
          <Box gap={1}>
            {tile('subagent tokens', d.k(tokens))}
            {tile('subagent cost', d.usd(cost))}
            {tile('time', mmss(time))}
          </Box>
        )}
      </Box>
      {groups.map(([id, title, color, list]) =>
        list.length === 0 ? null : (
          <Box key={`grp-${id}`} flexDirection="column" gap={1}>
            {strip(id, title, color, list.length)}
            {isGroupOpen(id) && list.map(workerCard)}
          </Box>
        ),
      )}
      <Box paddingX={1}>
        <Text dimColor size="caption" wrap="wrap">A card opens the pane by itself when a new round of subagents starts. Each card names the plan step it works for.</Text>
      </Box>
    </Box>
  )
}
