import type { PluginRow, Setup } from '../types'
import { card, section } from './kit'
import type { Fold } from './kit'

// The Setup tab: Agent Lens's own switches (what used to be separate mods), the thresholds, the other plugins
// from settings.json, and the way into Hooks and Output styles. Drawing only.

type Ui = { Box: any; Text: any; Button: any; Svg?: any }
// `hotkey` may come from register.tsx; rows inside a tab draw none.
export type Switch = { key: string; label: string; on: boolean; from: string; hotkey?: string; value?: string }
type Data = { switches: Switch[]; setup: Setup; plugins: PluginRow[]; hooks: string; style: string; fold: Fold }
type Acts = { flip: (key: string) => void; next: (key: keyof Setup) => void; plugin: (id: string) => void; hooks: () => void; styles: () => void; command: (name: string) => void }

// The slash commands Agent Lens registers: always on, a press puts one in the prompt box.
const COMMANDS = [
  ['replay', "/replay last turn's edits", 'replay-theater'],
  ['lens', '/lens open the sidebar', 'agent-lens'],
] as const

// The desktop's switch: a 26×14 pill, green with the knob right when on, gray with the knob left when off.
const pill = (on: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="14" viewBox="0 0 26 14"><rect width="26" height="14" rx="7" fill="${on ? '#16a34a' : '#d6d3d1'}"/><circle cx="${on ? 19 : 7}" cy="7" r="5" fill="#fff"/></svg>`

export const setupView = (ui: Ui, d: Data, act: Acts) => {
  const { Box, Text, Button, Svg } = ui
  const onN = d.switches.filter(s => s.on).length

  // One switch row: the switch (pill on desktop, ✓/○ on the terminal) and its label, pressed as one; the source dim on the right.
  const switchRow = (key: string, on: boolean, label: string, aside: string, press: () => void) => (
    <Box key={`row-${key}`} justifyContent="space-between" alignItems="center" gap={1}>
      <Box alignItems="center" gap={1}>
        {Svg && <Svg source={pill(on)} alt={on ? 'on' : 'off'} width={26} height={14} />}
        {Svg ? (
          <Button key={key} plain dimColor={!on} label={label} onPress={press} />
        ) : (
          <Button key={key} plain dimColor={!on} label={label} onPress={press}>
            <Text color={on ? 'green' : 'gray'}>{on ? '✓' : '○'}</Text> {label}
          </Button>
        )}
      </Box>
      <Text dimColor size="footnote" wrap="truncate-end">{aside}</Text>
    </Box>
  )
  const goRow = (key: string, label: string, summary: string, press: () => void) => (
    <Box key={`row-${key}`} justifyContent="space-between" gap={1}>
      <Button key={key} plain label={label} onPress={press} />
      <Text dimColor size="footnote" wrap="truncate-end">{summary}</Text>
    </Box>
  )
  const THRESHOLDS: [keyof Setup, string, string][] = [
    ['handoffAt', 'offer a handoff at context', `${d.setup.handoffAt}%`],
    ['cacheTtlMin', 'prompt cache lives', d.setup.cacheTtlMin >= 60 ? '1 hour' : `${d.setup.cacheTtlMin} min`],
    ['cacheWarnS', 'warn before the cache goes cold', `${Math.floor(d.setup.cacheWarnS / 60)}:${String(d.setup.cacheWarnS % 60).padStart(2, '0')}`],
    ['holdWords', 'hold prompts over', `${d.setup.holdWords} words`],
  ]

  return (
    <Box flexDirection="column" gap={1}>
      {card(
        ui,
        'green',
        <>
          <Box justifyContent="space-between">
            <Text weight="semibold" color="green">Setup</Text>
            <Text dimColor size="caption">applies in every chat</Text>
          </Box>
          <Text size="footnote">
            <Text color="green">{onN} on</Text>
            <Text dimColor> · {d.switches.length - onN} off · {d.plugins.length} other mods</Text>
          </Text>
        </>,
      )}
      {section(ui, d.fold, 'set-built', 'Built in', true, () => (
        <Box flexDirection="column">
          {d.switches.map(s => switchRow(`sw-${s.key}`, s.on, s.value ? `${s.label} · ${s.value}` : s.label, s.from, () => act.flip(s.key)))}
        </Box>
      ), <Text dimColor size="caption">was a separate mod</Text>)}
      {section(ui, d.fold, 'set-cmds', 'Commands', true, () => (
        <Box flexDirection="column">
          {COMMANDS.map(([name, label, from]) => goRow(`cmd-${name}`, label, from, () => act.command(`/${name}`)))}
        </Box>
      ), <Text dimColor size="caption">stay as /commands</Text>)}
      {d.plugins.length > 0 &&
        section(ui, d.fold, 'set-plugins', 'Other mods', true, () => (
          <Box flexDirection="column">
            {d.plugins.map(p => {
              const [name = p.id, market = ''] = p.id.split('@')

              return switchRow(`pl-${p.id}`, p.on, name, market, () => act.plugin(p.id))
            })}
            <Text dimColor size="caption" wrap="wrap">counts after /reload-plugins</Text>
          </Box>
        ), <Text dimColor size="caption">found in settings.json · {d.plugins.filter(p => p.on).length} on</Text>)}
      {section(ui, d.fold, 'set-limits', 'Thresholds', true, () => (
        <Box flexDirection="column">
          {THRESHOLDS.map(([key, label, value]) => (
            <Box key={`row-th-${key}`} justifyContent="space-between" gap={1}>
              <Button key={`th-${key}`} plain label={label} onPress={() => act.next(key)} />
              <Text weight="bold" tabular>{value}</Text>
            </Box>
          ))}
          <Box key="row-th-rule" justifyContent="space-between" gap={1}>
            <Text>a rule is saved to</Text>
            <Text weight="bold">ask: everywhere · this project</Text>
          </Box>
        </Box>
      ), <Text dimColor size="caption">press a row for the next value</Text>)}
      {goRow('setup-hooks', '▸ Hooks', d.hooks, act.hooks)}
      {goRow('setup-styles', '▸ Output styles', d.style, act.styles)}
    </Box>
  )
}
