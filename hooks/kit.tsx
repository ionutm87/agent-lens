// The Flow tab's design, shared by every tab: a card on top saying where things stand, a NEEDS YOU box with
// the decisions, foldable sections (title on the left, the summary on the right). Drawing only, like the tabs.

type Ui = { Box: any; Text: any; Button: any } // ponytail: terminal elements, untyped here; register.tsx provides them from $.ui.resolve
export type Fold = { isOpen: (key: string, byDefault: boolean) => boolean; toggle: (key: string, open: boolean) => void }

export const card = ({ Box }: Ui, color: string, children: any) => (
  <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
    {children}
  </Box>
)

// "▰▰▰▱▱▱▱▱▱▱": how much of the whole is done (or healthy), at a glance.
export const bar = ({ Text }: Ui, part: number, whole: number) => {
  const n = whole ? Math.round((part / whole) * 10) : 0

  return (
    <Text>
      <Text color="green">{'▰'.repeat(n)}</Text>
      <Text dimColor>{'▱'.repeat(10 - n)}</Text>
    </Text>
  )
}

export const needsYou = ({ Box, Text }: Ui, summary: string, children: any, hint: string) => (
  <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
    <Text bold color="blue">
      NEEDS YOU <Text dimColor>{summary}</Text>
    </Text>
    {children}
    <Text dimColor wrap="wrap">{hint}</Text>
  </Box>
)

export const section = ({ Box, Button }: Ui, fold: Fold, key: string, title: string, byDefault: boolean, body: () => any, aside?: any) => {
  const open = fold.isOpen(key, byDefault)

  return (
    <Box key={`sec-${key}`} flexDirection="column">
      <Box justifyContent="space-between">
        <Button key={`fold-${key}`} plain label={`${open ? '▾' : '▸'} ${title}`} onPress={() => fold.toggle(key, !open)} />
        {aside}
      </Box>
      {open && body()}
    </Box>
  )
}
