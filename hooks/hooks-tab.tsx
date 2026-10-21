import type { HookDraft, HookPaths, HookRow } from '../types'
import { EVENTS, hookLabel, mainKey, mainText } from './settings-hooks'
import { card, section } from './kit'
import type { Fold } from './kit'

// Hooks tab, drawing only (like styles-tab.tsx): what touches `$` lives in register.tsx.
// Global hooks only turn on/off; the project's take any change. "Off" = parked in a *.hooks-off.json beside the file.

export type LensSwitch = { key: string; label: string; on: boolean; what: string }
export type HookData = { rows: HookRow[]; draft: HookDraft | null; note: string; loaded: boolean; paths: HookPaths; lens: LensSwitch[]; fold: Fold }
export type HookActions = {
  open: (row: HookRow) => void
  fresh: () => void
  back: () => void
  toggle: (row: HookRow) => void
  remove: (row: HookRow) => void
  edit: (patch: Partial<HookDraft>) => void
  save: () => void
  refresh: () => void
  lens: (key: string) => void
}
type Ui = { Box: any; Text: any; Button: any; Input: any; Select: any } // ponytail: terminal elements, untyped here; register.tsx provides them from $.ui.resolve

const WHERE = { global: 'global settings', project: '.claude/settings.json · shared', local: '.claude/settings.local.json · just you' } as const

export const hooksView = (ui: Ui, { rows, draft, note, loaded, paths, lens, fold }: HookData, act: HookActions) => {
  const { Box, Text, Button, Input, Select } = ui
  if (!loaded) return <Text dimColor>Reading the hooks…</Text>

  const status = note ? <Text wrap="wrap" color={note.startsWith('✗') ? 'red' : 'green'}>{note}</Text> : null
  const title = (r: HookRow) => `${r.isOff ? '○' : '●'} ${r.event}${r.matcher ? ` · ${r.matcher}` : ''}`

  if (draft) {
    const r = draft.row
    const back = <Button key="hk-back" plain label="← list" hotkey="b" onPress={act.back} />

    // A global hook: read here, only turned on/off.
    if (r?.scope === 'global') {
      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold wrap="truncate-end">{title(r)}</Text>
            {back}
          </Box>
          <Text dimColor wrap="truncate-start">{r.file}{r.isOff ? ' · off, parked beside it' : ''}</Text>
          <Box marginTop={1}>
            <Text wrap="wrap">{mainText(r.hook)}</Text>
          </Box>
          <Box marginTop={1}>
            <Button key="hk-global-toggle" variant="primary" label={r.isOff ? 'turn on' : 'turn off'} onPress={() => act.toggle(r)} />
          </Box>
          {status}
        </Box>
      )
    }

    const field = r ? mainKey(r.hook) : 'command'

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold wrap="truncate-end">{r ? title(r) : '+ new hook'}</Text>
          {back}
        </Box>
        {r && <Text dimColor wrap="wrap">{WHERE[r.scope]}{r.isOff ? ' · off, parked beside it' : ''}</Text>}
        <Box flexDirection="column" marginTop={1}>
          <Select key="hk-event" label="event " options={EVENTS.map(v => ({ value: v }))} value={draft.event} onSelect={(v: string) => act.edit({ event: v })} />
          <Input key="hk-matcher" label="matcher " placeholder="all (or e.g. Bash|Edit|Write)" value={draft.matcher} submitLabel="save" onInput={(v: string) => act.edit({ matcher: v })} onSubmit={act.save} />
          <Input key="hk-text" label={`${field} `} placeholder={field === 'command' ? 'shell command; reads the event JSON on stdin' : field} value={draft.text} submitLabel="save" onInput={(v: string) => act.edit({ text: v })} onSubmit={act.save} />
          <Input key="hk-timeout" label="timeout " placeholder="seconds (empty = default)" value={draft.timeout} submitLabel="save" onInput={(v: string) => act.edit({ timeout: v })} onSubmit={act.save} />
          {!r && (
            <Select key="hk-where" label="file " options={[{ value: 'local', label: WHERE.local }, { value: 'project', label: WHERE.project }]} value={draft.scope} onSelect={(v: string) => act.edit({ scope: v === 'project' ? 'project' : 'local' })} />
          )}
        </Box>
        <Box gap={1} marginTop={1}>
          <Button key="hk-save" variant="primary" label={r ? 'save' : 'add'} hotkey="s" onPress={act.save} />
          {r && <Button key="hk-toggle" label={r.isOff ? 'turn on' : 'turn off'} onPress={() => act.toggle(r)} />}
          {r && <Button key="hk-delete" label="delete" onPress={() => act.remove(r)} />}
        </Box>
        {status}
      </Box>
    )
  }

  // A Button is no inline element: inside a Text the engine refuses the whole tree.
  const row = (r: HookRow) => (
    <Box key={`hk-${r.id}`}>
      <Text color={r.isOff ? undefined : 'green'} dimColor={r.isOff}>{r.isOff ? '○ ' : '● '}</Text>
      <Button key={`hk-open-${r.id}`} plain label={`${r.event}${r.matcher ? ` ${r.matcher}` : ''}`} onPress={() => act.open(r)} />
      <Text dimColor wrap="truncate-end">  {r.scope === 'global' ? '' : `${r.scope} · `}{hookLabel(r.hook)}</Text>
      <Button key={`hk-toggle-${r.id}`} plain label={r.isOff ? ' on' : ' off'} onPress={() => act.toggle(r)} />
    </Box>
  )
  const global = rows.filter(r => r.scope === 'global')
  const project = rows.filter(r => r.scope !== 'global')
  const on = rows.filter(r => !r.isOff).length

  return (
    <Box flexDirection="column" gap={1}>
      {card(
        ui,
        'green',
        <>
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text bold>{rows.length}</Text>
              <Text dimColor> hooks · </Text>
              <Text color="green">● {on} on</Text>
              <Text dimColor> · ○ {rows.length - on} off</Text>
            </Text>
            <Button key="hk-refresh" plain label="↻" onPress={act.refresh} />
          </Box>
          <Text dimColor wrap="wrap">Claude Code reads hooks when a session starts: a change applies from the next one (or after review in /hooks). Off = parked in *.hooks-off.json beside the file.</Text>
          {status}
        </>,
      )}
      {section(
        ui,
        fold,
        'hk-lens',
        "Agent Lens · this mod's switches",
        true,
        () => (
          <Box flexDirection="column">
            {lens.map(s => (
              <Box key={`hl-${s.key}`}>
                <Text color={s.on ? 'green' : undefined} dimColor={!s.on}>{s.on ? '● ' : '○ '}{s.label}</Text>
                <Text dimColor wrap="truncate-end">  {s.what}</Text>
                <Button key={`hl-${s.key}-toggle`} plain label={s.on ? ' off' : ' on'} onPress={() => act.lens(s.key)} />
              </Box>
            ))}
          </Box>
        ),
        <Text dimColor>{lens.filter(s => s.on).length}/{lens.length} on</Text>,
      )}
      {section(
        ui,
        fold,
        'hk-global',
        'Global · on/off only',
        true,
        () => (
          <Box flexDirection="column">
            <Text dimColor wrap="truncate-start">{paths.global || '—'}</Text>
            {global.length === 0 && <Text dimColor>no hooks</Text>}
            {global.map(r => row(r))}
          </Box>
        ),
        <Text dimColor>{global.length}</Text>,
      )}
      {section(
        ui,
        fold,
        'hk-project',
        'Project · add, edit, delete',
        true,
        () => (
          <Box flexDirection="column">
            <Text dimColor wrap="truncate-start">{paths.project ? paths.project.replace(/settings\.json$/, 'settings{,.local}.json') : 'no project folder in this session'}</Text>
            {paths.project !== '' && project.length === 0 && <Text dimColor>no hooks · “+ new” writes to .claude/settings.local.json</Text>}
            {project.map(r => row(r))}
          </Box>
        ),
        paths.project !== '' ? <Button key="hk-new" plain label="+ new" hotkey="a" onPress={act.fresh} /> : <Text dimColor>{project.length}</Text>,
      )}
      <Text dimColor>● on ○ off · press a hook to open it · plugin hooks are not listed</Text>
    </Box>
  )
}
