import type { Style, StyleDraft } from '../types'

import { card, section } from './kit'
import type { Fold } from './kit'

// Output style tab, drawing only (like memories-tab.tsx): what touches `$` lives in register.tsx.

export type StyleData = { list: Style[]; active: string; draft: StyleDraft | null; fresh: string; note: string; loaded: boolean; fold: Fold }
export type StyleActions = {
  open: (file: string) => void
  back: () => void
  use: (file: string) => void
  desc: (v: string) => void
  line: (i: number, v: string) => void
  add: (i: number) => void
  drop: (i: number) => void
  save: () => void
  fresh: (v: string) => void
  create: (name: string) => void
  refresh: () => void
}
type Ui = { Box: any; Text: any; Button: any; Input: any } // ponytail: terminal elements, untyped here; register.tsx provides them from $.ui.resolve

export const stylesView = (ui: Ui, { list, active, draft, fresh, note, loaded, fold }: StyleData, act: StyleActions) => {
  const { Box, Text, Button, Input } = ui
  if (!loaded) return <Text dimColor>Reading the output styles…</Text>

  const status = note ? <Text wrap="wrap" color={note.startsWith('✗') ? 'red' : 'green'}>{note}</Text> : null
  const style = draft && list.find(s => s.file === draft.file)

  // An open style: description and instructions edited line by line. Enter in a field = save.
  if (draft && style) {
    const isActive = style.name === active

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color={isActive ? 'green' : undefined} wrap="truncate-end">{isActive ? '● ' : '○ '}{style.name}</Text>
          <Button key="st-back" plain label="← list" hotkey="b" onPress={act.back} />
        </Box>
        <Text dimColor wrap="truncate-start">{style.file}{draft.dirty ? ' · unsaved changes' : ''}</Text>
        <Box gap={1} marginTop={1}>
          <Button key="st-use" variant="primary" label={isActive ? 'in use' : 'use this style'} onPress={() => act.use(style.file)} />
          <Button key="st-save" label="save" hotkey="s" onPress={act.save} />
        </Box>
        {status}
        <Box marginTop={1} flexDirection="column">
          <Input key="st-desc" label="description " placeholder="one line" value={draft.description} submitLabel="save" onInput={act.desc} onSubmit={act.save} />
          <Text bold dimColor>INSTRUCTIONS · one line per field</Text>
          {draft.lines.map((l, i) => (
            <Box key={`st-row-${i}`}>
              <Input key={`st-line-${i}`} placeholder="(empty line)" value={l} submitLabel="save" onInput={(v: string) => act.line(i, v)} onSubmit={act.save} />
              <Button key={`st-add-${i}`} plain label=" +" onPress={() => act.add(i)} />
              <Button key={`st-drop-${i}`} plain label=" ×" onPress={() => act.drop(i)} />
            </Box>
          ))}
        </Box>
        <Text dimColor wrap="wrap">+ inserts a line below · × removes it · a style change reaches the model from the next session.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {/* A Button is no inline element: inside a Text the engine refuses the whole tree. */}
      {card(
        ui,
        'green',
        <>
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text bold>{list.length}</Text>
              <Text dimColor> styles · active: </Text>
              <Text bold color="green">{active || 'default'}</Text>
            </Text>
            <Button key="st-refresh" plain label="↻" onPress={act.refresh} />
          </Box>
          <Text dimColor wrap="wrap">Press a name to read and edit it · “use” writes outputStyle in settings.json, read at the start of the next session.</Text>
          {status}
        </>,
      )}
      {section(
        ui,
        fold,
        'st-list',
        'Styles',
        true,
        () => (
          <Box flexDirection="column">
            {/* Two lines per style: name and "use" on one, the description under it, cut at the pane's width. */}
            {list.map(s => (
              <Box key={`st-${s.file}`} flexDirection="column">
                <Box justifyContent="space-between">
                  <Box flexShrink={1} minWidth={0}>
                    <Text color={s.name === active ? 'green' : undefined}>{s.name === active ? '● ' : '○ '}</Text>
                    <Button key={`st-open-${s.file}`} plain label={s.name} onPress={() => act.open(s.file)} />
                  </Box>
                  <Box flexShrink={0} marginLeft={2}>
                    {s.name === active ? <Text color="green">in use</Text> : <Button key={`st-quick-${s.file}`} plain label="use" onPress={() => act.use(s.file)} />}
                  </Box>
                </Box>
                <Box marginLeft={2}>
                  <Text dimColor wrap="truncate-end">{s.description}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        ),
        <Text dimColor>{list.length}</Text>,
      )}
      {section(ui, fold, 'st-new', 'New style', true, () => (
        <Input key="st-new" label="name " placeholder={`name; starts as a copy of ${active || 'the first style'}`} value={fresh} submitLabel="create" onInput={act.fresh} onSubmit={act.create} />
      ))}
    </Box>
  )
}
