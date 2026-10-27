export type Step = {
  id: string
  turnId: string
  index: number
  model: string
  effort?: string
  agentId?: string
  isDone: boolean
  tools: string[]
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cost?: number
  stop: string | null
  answer: string
  uses: { tool: string; brief: string }[]
}

// An open step in Flow: the answer text and each tool with its input and what it returned.
export type StepView = { id: string; title: string; answer: string; uses: { tool: string; brief: string; output?: string; isError?: boolean }[] }

export type Worker = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  parentModel: string
  isBackground: boolean
  status: 'running' | 'done' | 'aborted' | 'denied'
  startedAt: number
  durationMs?: number
  tokensOut?: number
  tools: number
  prompt?: string
  answer?: string
  // The plan step under way when it started: the step it works for.
  planStep?: string
}

export type Tab = 'think' | 'agents' | 'chat' | 'changes' | 'memories' | 'setup' | 'styles' | 'hooks'

export type Change = { path: string; code: string; staged: boolean; unstaged: boolean; add: number; del: number }

export type Repo = { top: string; branch: string; loaded: boolean }

export type GitNote = { ok: boolean; text: string }

export type Diff = { path: string; text: string }

// One commit of the Git tab's history (`git log --shortstat`).
export type Commit = { hash: string; date: string; time: string; subject: string; files: number; add: number; del: number }

// The Memories map: how close it looks (1 = all) and which type it shows in full.
export type MemGraph = { zoom: number; type: string }

// What the model said about one memory ("explain").
export type MemExplain = { name: string; running: boolean; text: string; note: string }

// cost: USD at each step's real model.
export type Totals = { steps: number; tokensIn: number; tokensOut: number; cacheRead: number; cost?: number }

// A plan step. tier/why: the model's suggestion that a subagent on that model would do this step well;
// it stays a suggestion until the person confirms it from Flow (the confirmation reaches the model as an answer).
export type PlanStep = { id: string; title: string; tier?: 'haiku' | 'sonnet' | 'opus'; why: string; after: string[]; status: 'todo' | 'run' | 'done' | 'skip' }

// The plan published by the model through the `plan` tool: how it understood the request and how it splits it.
export type Plan = {
  goal: string
  approach: string
  clarity: number
  assumptions: string[]
  questions: { ask: string; why: string; options: string[]; fallback: string }[]
  betterPrompt: string
  steps: PlanStep[]
  savings: string[]
  revision: number
  at: number
}

// The answer to a plan question, keyed by the question text: draft, on its way to the model, read.
export type Answer = { text: string; state: 'draft' | 'pending' | 'sent' }


// A memory from ~/.claude/projects/<slug>/memory, with [[name]] links to others.
export type Memory = { name: string; file: string; type: string; description: string; links: string[]; indexed: boolean; hook: string; size: number; mtimeMs: number }

// How it was used in this session: read (Read/Bash), written (Write/Edit), recalled (engine attachment).
export type MemoryUse = { read: number; write: number; recalled: number }

// What enters the context from memory (from /context) and the directory read.
export type MemoryMeta = {
  dir: string
  loaded: boolean
  context: { path: string; type: string; tokens: number }[]
  remember: { name: string; size: number }[]
  recalls: { type: string; names: string[] }[]
}

export type MemoryView = { name: string; body: string }

// The last "analyze" run: a verdict per memory name (relevant / stale / irrelevant, with the why), kept per project.
// fix: the body rewritten for a stale memory (applied on click); gone: references the code no longer has.
export type MemoryAudit = { at: number; running: boolean; note: string; verdicts: Record<string, { verdict: 'relevant' | 'stale' | 'irrelevant'; why: string; fix?: string; gone?: string[] }> }

// Output styles: Markdown files in <config>/output-styles/. The draft is the one being edited, line by line.
export type Style = { file: string; name: string; description: string; keep: boolean; body: string }
export type StyleDraft = { file: string; description: string; lines: string[]; dirty: boolean }

// The prompt check: Haiku's read of the prompt at submit (clarity, what is missing, questions, a rewrite).
export type PromptCheck = { at: number; running: boolean; clarity: number; missing: string[]; questions: Plan['questions']; better: string; note: string }

// The effort for one message, picked from its words (hooks/effort.ts): `from` and the model tip come at the
// turn's first step; `isApplied` = the step runs at `level` (auto mode, or Lower/Higher pressed).
export type EffortMode = 'auto' | 'tip' | 'off'
export type EffortPick = {
  at: number
  text: string
  turnId?: string
  level: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  why: string
  from?: string
  model?: string
  tip: { label: string; command: string; note: string } | null
  isApplied: boolean
  mode: EffortMode
}

// What Agent Lens did on its own this turn, one line each (Flow · While it works).
export type Did = { at: number; mark: string; text: string; tone?: 'ok' | 'run' | 'info' | 'bad' }

// A long prompt held before sending (it is also back in the prompt box, so nothing is lost).
export type Held = { text: string; at: number }

// Flow's three stages; `stageView` null = follow the turn.
export type Stage = 'before' | 'during' | 'after'

// A Claude Code hook from a settings file (global, project shared, project local); isOff = parked in the
// sibling *.hooks-off.json, since settings have no per-hook switch.
export type HookEntry = { type: string; timeout?: number; [key: string]: unknown }
export type HookRow = { id: string; scope: 'global' | 'project' | 'local'; file: string; event: string; matcher: string; hook: HookEntry; isOff: boolean }
// The hook open in the tab; row null = a new one, written to `scope`'s file.
export type HookDraft = { row: HookRow | null; scope: 'project' | 'local'; event: string; matcher: string; text: string; timeout: string }
export type HookPaths = { global: string; project: string; local: string }

// A file the chat read or wrote (Chat tab).
export type FileTouch = { path: string; read: number; wrote: number }

// One edit of a turn, replayed in the Chat tab: `at` = the turn it belongs to (turnAt).
export type EditRec = { at: number; path: string; old: string; new: string }

// Setup: switches and thresholds kept across sessions ($.store 'setup').
export type Setup = {
  band: boolean
  cache: boolean
  handoff: boolean
  reflect: boolean
  handoffAt: number
  cacheTtlMin: number
  cacheWarnS: number
  holdWords: number
}

// A correction the person made, turned by Haiku into a rule to save (Reflect).
export type Reflect = { at: number; text: string; rule: string; running: boolean; state: 'open' | 'saved' | 'skipped'; note: string }

// A plugin from settings.json enabledPlugins (Setup · Other mods).
export type PluginRow = { id: string; on: boolean }

declare module 'claude-code' {
  interface PluginState {
    'agent-lens': {
      steps: Step[]
      workers: Worker[]
      skillsUsed: Record<string, number>
      toolCounts: Record<string, number>
      prompt: string
      tab: Tab
      fold: Record<string, boolean>
      totals: Totals
      hasGraph: boolean
      graphFirst: boolean
      graphSeen: boolean
      changes: Change[]
      repo: Repo
      commitMsg: string
      gitNote: GitNote | null
      diff: Diff | null
      drafting: boolean
      syncing: boolean
      stepView: StepView | null
      plan: Plan | null
      answers: Record<string, Answer>
      busy: boolean
      memories: Memory[]
      memMeta: MemoryMeta
      memUse: Record<string, MemoryUse>
      memView: MemoryView | null
      memType: string
      memAudit: MemoryAudit
      memGraph: MemGraph
      memDraft: string | null
      memExplain: MemExplain | null
      commits: Commit[]
      styles: Style[]
      styleActive: string
      styleDraft: StyleDraft | null
      styleFresh: string
      styleNote: string
      styleLoaded: boolean
      planFirst: boolean
      planAsked: boolean
      turnAt: number
      checkOn: boolean
      promptCheck: PromptCheck | null
      hookRows: HookRow[]
      hookDraft: HookDraft | null
      hookNote: string
      hooksLoaded: boolean
      hookPaths: HookPaths
      effortMode: EffortMode
      effortPick: EffortPick | null
      did: Did[]
      held: Held | null
      released: string
      holdOn: boolean
      stageView: Stage | null
      files: FileTouch[]
      edits: EditRec[]
      editIdx: number
      setup: Setup
      reflect: Reflect | null
      idleAt: number
      tick: number
      bandHidden: boolean
      handoffSnooze: number
      plugins: PluginRow[]
    }
  }
}
