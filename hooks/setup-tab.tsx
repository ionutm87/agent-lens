import type { PluginRow, Setup } from '../types'
import { card, section } from './kit'
import type { Fold } from './kit'

// The Setup tab: Agent Lens's own switches (what used to be separate mods), the thresholds, the other plugins
// from settings.json, and the way into Hooks and Output styles. Drawing only.

type Ui = { Box: any; Text: any; Button: any }
export type Switch = { key: string; label: string; on: boolean; from: string; hotkey?: string; value?: string }
type Data = { switches: Switch[]; setup: Setup; plugins: PluginRow[]; hooks: string; style: string; fold: Fold }
type Acts = { flip: (key: string) => void; next: (key: keyof Setup) => void; plugin: (id: string) => void; hooks: () => void; styles: () => void }

export const setupView = (ui: Ui, d: Data, act: Acts) => {
  const { Box, Text, Button } = ui
  const onN = d.switches.filter(s => s.on).length
  const row = (s: Switch) => (
    <Box key={`sw-${s.key}`} justifyContent="space-between">
      <Button key={`sw-${s.key}`} plain dimColor={!s.on} hotkey={s.hotkey} label={`${s.on ? '✓' : '○'} ${s.label}${s.value ? ` ${s.value}` : ''}`} onPress={() => act.flip(s.key)} />
      <Text dimColor>{s.from}</Text>
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
            <Text bold color="green">Setup</Text>
            <Text dimColor>applies at once</Text>
          </Box>
          <Text>
            <Text color="green">{onN} on</Text>
            <Text dimColor> · {d.switches.length - onN} off · {d.plugins.length} plugins</Text>
          </Text>
        </>,
      )}
      {section(ui, d.fold, 'set-built', 'Built in', true, () => <Box flexDirection="column">{d.switches.map(row)}</Box>, <Text dimColor>was a separate mod</Text>)}
      {section(ui, d.fold, 'set-limits', 'Thresholds', true, () => (
        <Box flexDirection="column">
          {THRESHOLDS.map(([key, label, value]) => (
            <Box key={`th-${key}`} justifyContent="space-between">
              <Text>{label}</Text>
              <Button key={`th-${key}`} plain label={`[${value}]`} onPress={() => act.next(key)} />
            </Box>
          ))}
          <Text dimColor>press a value for the next one</Text>
        </Box>
      ))}
      {d.plugins.length > 0 &&
        section(ui, d.fold, 'set-plugins', 'Other plugins', false, () => (
          <Box flexDirection="column">
            {d.plugins.map(p => {
              const [name, market] = p.id.split('@')

              return (
                <Box key={`pl-${p.id}`} justifyContent="space-between">
                  <Button key={`pl-${p.id}`} plain dimColor={!p.on} label={`${p.on ? '✓' : '○'} ${name}`} onPress={() => act.plugin(p.id)} />
                  <Text dimColor wrap="truncate-end">{market ?? ''}</Text>
                </Box>
              )
            })}
            <Text dimColor wrap="wrap">settings.json enabledPlugins · a change counts after /reload-plugins</Text>
          </Box>
        ), <Text dimColor>{d.plugins.filter(p => p.on).length} on</Text>)}
      <Box justifyContent="space-between">
        <Button key="setup-hooks" plain label="▸ Hooks" hotkey="h" onPress={act.hooks} />
        <Text dimColor>{d.hooks}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Button key="setup-styles" plain label="▸ Output styles" onPress={act.styles} />
        <Text dimColor>{d.style}</Text>
      </Box>
    </Box>
  )
}
