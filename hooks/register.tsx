import { atom, read, update } from 'claude-code'
import type { Engine, HookFor, Register, RenderChildren } from 'claude-code'

import type { Answer, Change, Commit, Did, Diff, EditRec, EffortMode, EffortPick, FileTouch, GitNote, Held, HookDraft, HookPaths, HookRow, MemExplain, MemGraph, Memory, MemoryAudit, MemoryMeta, MemoryUse, MemoryView, Plan, PlanStep, PluginRow, PromptCheck, Reflect, Repo, Setup, Stage, Step, StepView, Style, StyleDraft, Tab, Totals, Worker } from '../types'
import { asLevel, pickFor, rank, shift, tipFor } from './effort'
import { branchLabel, cleanMessage, clip, outcomeOf, parseLog, parseNumstat, parseStatus, syncSteps, withCounts } from './changes'
import { PLAN_DESCRIPTION, PLAN_RULE, PLAN_SCHEMA, PLAN_TOOL, PLAN_TOOL_ID, answersMessage, delegationAsk, delegationText, layers, mirrorTodos, normalizePlan } from './plan'
import { INDEX, memoriesView } from './memories-tab'
import { stylesView } from './styles-tab'
import { hooksView } from './hooks-tab'
import { checkPrompt, ownText, parseCheck, worthChecking } from './check'
import { hasHook, hookFromDraft, mainText, offFile, parseSettings, replaceHook, rowsOf, serialize, withHook, withoutHook } from './settings-hooks'
import type { HookRef, Settings } from './settings-hooks'
import { activeStyle, buildStyle, parseStyle, slugName, withOutputStyle } from './styles'
import { explainPrompt, namesIn, parseIndex, parseMemory, parseVerdicts, projectSlug, refsOf, toMermaid, withBody, withoutIndexLine, withoutLink } from './memories'
import { card, section as kitSection, tiles } from './kit'
import { agentsView } from './agents-tab'
import { chatView } from './chat-tab'
import { setupView } from './setup-tab'
import type { Switch } from './setup-tab'
import { DEFAULT_SETUP, HANDOFF_PROMPT, barSvg, cacheLeft, cycle, isCorrection, mmss, parseRule, rulePrompt, setupOf, withRule } from './extras'
import type { Ref } from './memories'
import { costOf, tierOf } from './cost'
import type { Tier } from './cost'

const PANE = 'agent-lens'

const steps = atom({ plugin: 'agent-lens', key: 'steps' } as const, [])
const workers = atom({ plugin: 'agent-lens', key: 'workers' } as const, [])
const skillsUsed = atom({ plugin: 'agent-lens', key: 'skillsUsed' } as const, {})
const toolCounts = atom({ plugin: 'agent-lens', key: 'toolCounts' } as const, {})
const prompt = atom({ plugin: 'agent-lens', key: 'prompt' } as const, '')
const tab = atom({ plugin: 'agent-lens', key: 'tab' } as const, 'think' as Tab)
// What is open/closed in Flow, by key; a missing key = the row's default state.
const folds = atom({ plugin: 'agent-lens', key: 'fold' } as const, {} as Record<string, boolean>)
const totals = atom({ plugin: 'agent-lens', key: 'totals' } as const, { steps: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 } as Totals)
const hasGraph = atom({ plugin: 'agent-lens', key: 'hasGraph' } as const, false)
const graphFirst = atom({ plugin: 'agent-lens', key: 'graphFirst' } as const, true)
const graphSeen = atom({ plugin: 'agent-lens', key: 'graphSeen' } as const, false)
const changes = atom({ plugin: 'agent-lens', key: 'changes' } as const, [] as Change[])
const repo = atom({ plugin: 'agent-lens', key: 'repo' } as const, { top: '', branch: '', loaded: false } as Repo)
const commitMsg = atom({ plugin: 'agent-lens', key: 'commitMsg' } as const, '')
const gitNote = atom({ plugin: 'agent-lens', key: 'gitNote' } as const, null as GitNote | null)
const diff = atom({ plugin: 'agent-lens', key: 'diff' } as const, null as Diff | null)
const drafting = atom({ plugin: 'agent-lens', key: 'drafting' } as const, false)
const syncing = atom({ plugin: 'agent-lens', key: 'syncing' } as const, false)
const stepView = atom({ plugin: 'agent-lens', key: 'stepView' } as const, null as StepView | null)
const memories = atom({ plugin: 'agent-lens', key: 'memories' } as const, [] as Memory[])
const memMeta = atom({ plugin: 'agent-lens', key: 'memMeta' } as const, { dir: '', loaded: false, context: [], remember: [], recalls: [] } as MemoryMeta)
const memUse = atom({ plugin: 'agent-lens', key: 'memUse' } as const, {} as Record<string, MemoryUse>)
const memView = atom({ plugin: 'agent-lens', key: 'memView' } as const, null as MemoryView | null)
const memAudit = atom({ plugin: 'agent-lens', key: 'memAudit' } as const, { at: 0, running: false, note: '', verdicts: {} } as MemoryAudit)
const memGraph = atom({ plugin: 'agent-lens', key: 'memGraph' } as const, { zoom: 1, type: 'all' } as MemGraph)
const memDraft = atom({ plugin: 'agent-lens', key: 'memDraft' } as const, null as string | null)
const memExplain = atom({ plugin: 'agent-lens', key: 'memExplain' } as const, null as MemExplain | null)
const commits = atom({ plugin: 'agent-lens', key: 'commits' } as const, [] as Commit[])
const styles = atom({ plugin: 'agent-lens', key: 'styles' } as const, [] as Style[])
const styleActive = atom({ plugin: 'agent-lens', key: 'styleActive' } as const, '')
const styleDraft = atom({ plugin: 'agent-lens', key: 'styleDraft' } as const, null as StyleDraft | null)
const styleFresh = atom({ plugin: 'agent-lens', key: 'styleFresh' } as const, '')
const styleNote = atom({ plugin: 'agent-lens', key: 'styleNote' } as const, '')
const styleLoaded = atom({ plugin: 'agent-lens', key: 'styleLoaded' } as const, false)
const plan = atom({ plugin: 'agent-lens', key: 'plan' } as const, null as Plan | null)
const answers = atom({ plugin: 'agent-lens', key: 'answers' } as const, {} as Record<string, Answer>)
const busy = atom({ plugin: 'agent-lens', key: 'busy' } as const, false)
const planFirst = atom({ plugin: 'agent-lens', key: 'planFirst' } as const, true)
const planAsked = atom({ plugin: 'agent-lens', key: 'planAsked' } as const, false)
const turnAt = atom({ plugin: 'agent-lens', key: 'turnAt' } as const, 0)
const checkOn = atom({ plugin: 'agent-lens', key: 'checkOn' } as const, true)
const promptCheck = atom({ plugin: 'agent-lens', key: 'promptCheck' } as const, null as PromptCheck | null)
const hookRows = atom({ plugin: 'agent-lens', key: 'hookRows' } as const, [] as HookRow[])
const hookDraft = atom({ plugin: 'agent-lens', key: 'hookDraft' } as const, null as HookDraft | null)
const hookNote = atom({ plugin: 'agent-lens', key: 'hookNote' } as const, '')
const hooksLoaded = atom({ plugin: 'agent-lens', key: 'hooksLoaded' } as const, false)
const hookPaths = atom({ plugin: 'agent-lens', key: 'hookPaths' } as const, { global: '', project: '', local: '' } as HookPaths)
const effortMode = atom({ plugin: 'agent-lens', key: 'effortMode' } as const, 'auto' as EffortMode)
const effortPick = atom({ plugin: 'agent-lens', key: 'effortPick' } as const, null as EffortPick | null)
const did = atom({ plugin: 'agent-lens', key: 'did' } as const, [] as Did[])
const held = atom({ plugin: 'agent-lens', key: 'held' } as const, null as Held | null)
const released = atom({ plugin: 'agent-lens', key: 'released' } as const, '')
const holdOn = atom({ plugin: 'agent-lens', key: 'holdOn' } as const, true)
const stageView = atom({ plugin: 'agent-lens', key: 'stageView' } as const, null as Stage | null)
const files = atom({ plugin: 'agent-lens', key: 'files' } as const, [] as FileTouch[])
const edits = atom({ plugin: 'agent-lens', key: 'edits' } as const, [] as EditRec[])
const editIdx = atom({ plugin: 'agent-lens', key: 'editIdx' } as const, 0)
const setup = atom({ plugin: 'agent-lens', key: 'setup' } as const, DEFAULT_SETUP as Setup)
const reflect = atom({ plugin: 'agent-lens', key: 'reflect' } as const, null as Reflect | null)
const idleAt = atom({ plugin: 'agent-lens', key: 'idleAt' } as const, 0)
const tick = atom({ plugin: 'agent-lens', key: 'tick' } as const, 0)
const bandHidden = atom({ plugin: 'agent-lens', key: 'bandHidden' } as const, false)
const handoffSnooze = atom({ plugin: 'agent-lens', key: 'handoffSnooze' } as const, 0)
const plugins = atom({ plugin: 'agent-lens', key: 'plugins' } as const, [] as PluginRow[])

// A message's effort pick waits this long for its turn, unless the turn carries the same text.
const PICK_MS = 15_000

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

// ANSI colors by name: Omarchy writes the terminal's 16-color palette
// (ghostty/alacritty/kitty) on every theme change, so the sidebar follows it on its own.
const C = {
  accent: 'green',
  model: 'cyan',
  ok: 'green',
  run: 'yellow',
  bad: 'red',
  info: 'blue',
  graph: 'cyan',
} as const

// One color per model: opus magenta, sonnet blue, haiku green.
const TIER_COLOR: Record<Tier, string | undefined> = { opus: 'magenta', sonnet: 'blue', haiku: 'green' }
const modelColor = (model: string) => TIER_COLOR[tierOf(model) ?? 'opus']

const short = (model: string) => model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

// "2h13m" until the limit window resets
const until = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))

  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: '7 days', spend_limit: 'budget' }

// green, yellow 20 points before the threshold, red from the threshold
const pctColor = (pct: number, bad: number) => (pct >= bad ? C.bad : pct >= bad - 20 ? C.run : C.ok)

const secs = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`)

// What a tool does, briefly: the main input field (command, file, search), otherwise JSON.
export const brief = (input: unknown) => {
  const o = (input ?? {}) as Record<string, unknown>
  const main = ['command', 'file_path', 'pattern', 'query', 'description', 'prompt', 'url', 'skill'].map(key => o[key]).find(v => typeof v === 'string')

  return String(main ?? JSON.stringify(input) ?? '').slice(0, 400)
}

// Each tool of the step gets the output of the first unconsumed transcript call with the same tool + input.
export const pairUses = <U extends { tool: string; brief: string }, D extends U & { output?: string; isError?: boolean }>(uses: U[], done: D[]) => {
  const taken = new Set<number>()

  return uses.map(u => {
    const i = done.findIndex((d, n) => !taken.has(n) && d.tool === u.tool && d.brief === u.brief)
    if (i < 0) return { ...u }
    taken.add(i)

    return { ...u, output: done[i]?.output ? clip(done[i].output, 3000) : undefined, isError: done[i]?.isError }
  })
}

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`

const toolLabel = (tool: string) => tool.replace(/^mcp__(?:plugin_)?([^_]+(?:_[^_]+)*?)__/, '$1:')

const git = ($: Engine, top: string, args: string[], timeoutMs = 20_000) =>
  $.process.run(['git', '--no-optional-locks', '-C', top, ...args], { timeoutMs, env: { GIT_TERMINAL_PROMPT: '0' } })

// Rendering doesn't run processes: the status is read here and lands in atoms.
const refreshChanges = async ($: Engine) => {
  let snap: { top: string; branch: string; list: Change[] } | null = null
  try {
    const found = await git($, await $.session.root(), ['rev-parse', '--show-toplevel'])
    const top = found.stdout.trim()
    const status = found.exitCode === 0 ? await git($, top, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all']) : null
    if (status?.exitCode === 0) {
      const parsed = parseStatus(status.stdout)
      const diff = await git($, top, ['diff', 'HEAD', '--numstat', '-z'])
      snap = { top, branch: parsed.branch, list: withCounts(parsed.changes, diff.exitCode === 0 ? parseNumstat(diff.stdout) : {}) }
    }
  } catch {
    snap = null
  }
  await update($, repo, () => ({ top: snap?.top ?? '', branch: snap?.branch ?? '', loaded: true }))
  await update($, changes, () => snap?.list ?? [])
  const log = snap ? await git($, snap.top, ['log', '-30', '--date=format:%Y-%m-%d %H:%M', '--pretty=format:%x1e%h%x1f%ad%x1f%s', '--shortstat']).catch(() => null) : null
  await update($, commits, () => (log?.exitCode === 0 ? parseLog(log.stdout) : []))
}

const stage = async ($: Engine, top: string, paths: string[] | 'all') =>
  outcomeOf(await git($, top, paths === 'all' ? ['add', '-A'] : ['add', '--', ...paths]))

// ponytail: `restore --staged` needs a HEAD; it fails before the repo's first commit
const unstage = async ($: Engine, top: string, paths: string[] | 'all') =>
  outcomeOf(await git($, top, ['restore', '--staged', '--', ...(paths === 'all' ? ['.'] : paths)]))

// No --no-verify: the repo's hooks run, and their failure shows in the note.
const commit = async ($: Engine, top: string, message: string) => outcomeOf(await git($, top, ['commit', '-m', message]))

// Any git action of the tab: runs, keeps the result note, then re-reads the status.
const gitAct = async ($: Engine, run: (top: string) => Promise<GitNote>) => {
  const { top } = await read($, repo)
  if (!top) return
  const note = await run(top)
  await update($, gitNote, () => note)
  await refreshChanges($)
}

// Fetch, then only the missing steps (pull --ff-only / push) on the current branch. A timeout (network, SSH key
// with a passphrase) throws: it ends up in the note as a failure and doesn't block the button.
const syncRepo = async ($: Engine) => {
  const { top } = await read($, repo)
  if (!top || (await read($, syncing))) return
  await update($, syncing, () => true)
  let note: GitNote
  try {
    const fetched = outcomeOf(await git($, top, ['fetch', '--prune'], 120_000))
    await refreshChanges($)
    const branch = branchLabel((await read($, repo)).branch)
    const steps = fetched.ok ? syncSteps(branch) : []
    note = !fetched.ok ? fetched : branch.gone ? { ok: false, text: 'branch is gone from the remote (deleted after merge?)' } : { ok: true, text: 'up to date with the remote' }
    for (const step of steps) {
      const res = await git($, top, step, 120_000)
      note = res.exitCode === 0 ? { ok: true, text: `${step[0]} ✓` } : outcomeOf(res)
      if (!note.ok) break
    }
    if (steps.length > 1 && note.ok) note = { ok: true, text: 'pull + push ✓' }
  } catch (err) {
    note = { ok: false, text: `sync: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    await update($, syncing, () => false)
  }
  await update($, gitNote, () => note)
  await refreshChanges($)
}

// An opened step: tool outputs don't exist at the end of the step (they arrive later), so they are looked up
// in the transcript on open, by tool + input.
const openStep = async ($: Engine, s: Step) => {
  const messages = await $.session.messages(s.agentId ? { agentId: s.agentId } : {})
  const done = messages.flatMap(m => m.toolUses).map(u => ({ tool: u.tool, brief: brief(u.input), output: u.text, isError: u.isError }))
  await update($, stepView, () => ({ id: s.id, title: `${short(s.model)} #${s.index}`, answer: s.answer, uses: pairUses(s.uses ?? [], done) }))
}

// A file's diff against HEAD (index + working tree). A new, untracked file is compared with /dev/null;
// `diff --no-index` exits with 1 when there are differences, so 0 and 1 both count as success.
const openDiff = async ($: Engine, c: Change) => {
  const { top } = await read($, repo)
  if (!top) return
  const res = await git($, top, c.code === '?' ? ['diff', '--no-index', '--', '/dev/null', c.path] : ['diff', 'HEAD', '--', c.path])
  await update($, diff, () => ({ path: c.path, text: clip(res.exitCode <= 1 ? res.stdout : res.stderr, 90_000) }))
}

// The commit message from the staged files (not everything modified), written by Haiku in the style of
// the repo's recent subjects. A single line: the commit field is single-line.
const draftMessage = async ($: Engine) => {
  const { top } = await read($, repo)
  if (!top || (await read($, drafting))) return
  if (!(await read($, changes)).some(c => c.staged)) {
    return void (await update($, gitNote, () => ({ ok: false, text: 'Nothing staged: tick the files for the message.' })))
  }
  await update($, drafting, () => true)
  try {
    const [stat, patch, recent] = await Promise.all([
      git($, top, ['diff', '--cached', '--stat']),
      git($, top, ['diff', '--cached']),
      git($, top, ['log', '-8', '--format=%s']),
    ])
    const res = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 200,
      timeoutMs: 30_000,
      prompt: `Write a git commit message for the staged changes.
Rules: one line, imperative, at most 72 characters, same language and style as the recent subjects; no quotes, no trailing period, no explanation.

Recent subjects:
${recent.stdout}
Files:
${stat.stdout}
Diff:
${clip(patch.stdout, 12_000)}`,
    })
    const text = res.isAnswered ? cleanMessage(res.text) : ''
    if (text) {
      await update($, commitMsg, () => text)
      await update($, gitNote, () => null)
    } else {
      await update($, gitNote, () => ({ ok: false, text: `Haiku gave no message${res.isAnswered ? '' : ` (${res.reason})`}.` }))
    }
  } finally {
    await update($, drafting, () => false)
  }
}

// Answers from the Flow tab go to the model as soon as there is a way: in the running turn,
// attached to the next tool result (without interrupting it), otherwise as a user prompt.
const takeAnswers = async ($: Engine) => {
  const pending = Object.entries(await read($, answers)).filter(([, a]) => a.state === 'pending')
  if (!pending.length) return ''
  await update($, answers, all => {
    const next = { ...all }
    for (const [ask] of pending) if (next[ask]?.state === 'pending') next[ask] = { ...next[ask], state: 'sent' }
    return next
  })

  return answersMessage(pending.map(([ask, a]) => ({ ask, text: a.text })))
}

const submitAnswers = async ($: Engine) => {
  const text = await takeAnswers($)
  if (!text) return
  await update($, busy, () => true)
  void $.prompt.submit({ text, asUser: true })
}

const answer = async ($: Engine, ask: string, text: string) => {
  if (!text.trim()) return
  await update($, answers, all => ({ ...all, [ask]: { text: text.trim(), state: 'pending' as const } }))
  await logDid($, '↳', `Passed on your answer: ${clip(ask, 60)} → ${text.trim()}`, 'info')
  if (!(await read($, busy))) await submitAnswers($)
}

// "What Agent Lens did": one line per thing the mod did on its own this turn.
const logDid = async ($: Engine, mark: string, text: string, tone?: Did['tone']) => {
  const at = await $.clock.now()
  await update($, did, list => [...list, { at, mark, text, tone }].slice(-30))
}

// A held prompt goes out as the person chose: the finished one or theirs. The box is emptied first, and the
// text is marked so the submit hook treats it as the person's own and does not hold it again.
const sendHeld = async ($: Engine, text: string, finished: boolean) => {
  if (!text.trim()) return
  await update($, released, () => text)
  await update($, held, () => null)
  await $.prompt.fill({ text: '', mode: 'replace' }).catch(() => null)
  await logDid($, '✓', finished ? 'Sent the finished prompt' : 'Sent your prompt as you wrote it', 'ok')
  void $.prompt.submit({ text, asUser: true })
}

const fillPrompt = async ($: Engine, text: string, toast: string) => {
  const r = await $.prompt.fill({ text, mode: 'replace' }).catch(() => null)
  $.ui.toast(r?.isFilled ? toast : 'The prompt box did not take it: use [copy].')
}

// Lower / Higher: the pick moves one level and applies from the next step of the turn.
const moveEffort = async ($: Engine, by: number) => {
  const p = await read($, effortPick)
  if (!p) return
  const level = shift(p.level, by)
  await update($, effortPick, cur => (cur ? { ...cur, level, why: 'your call', isApplied: true } : cur))
  await logDid($, by > 0 ? '+' : '−', `Effort ${level} from the next step: your call`, 'run')
}

const flipEffortMode = async ($: Engine) => {
  const order: EffortMode[] = ['auto', 'tip', 'off']
  const next = order[(order.indexOf(await read($, effortMode)) + 1) % order.length]!
  await update($, effortMode, () => next)
  await $.store.set('effort', next)
  if (next === 'off') await update($, effortPick, () => null)
}

const flipHold = async ($: Engine) => {
  const isOn = !(await read($, holdOn))
  await update($, holdOn, () => isOn)
  await $.store.set('hold', isOn)
}

const commitStaged = async ($: Engine) => {
  const message = (await read($, commitMsg)).trim()
  const list = await read($, changes)
  if (!message) return void (await update($, gitNote, () => ({ ok: false, text: 'Write a commit message.' })))
  if (!list.some(c => c.staged)) return void (await update($, gitNote, () => ({ ok: false, text: 'Nothing staged: tick files or [stage all].' })))
  await gitAct($, async top => {
    const res = await commit($, top, message)
    if (res.ok) await update($, commitMsg, () => '')

    return res
  })
}

// The "Memories" tab: the current project's auto-memory as a graph, and how it reaches the model.
// The directory comes from /context (the AutoMem file the engine actually loads); without it, the project slug.
const memoryDir = async ($: Engine, context: MemoryMeta['context']) => {
  const auto = context.find(f => f.type === 'AutoMem')
  if (auto) return auto.path.slice(0, auto.path.lastIndexOf('/'))
  const base = await $.process.run(['sh', '-c', 'printf %s "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"'])

  return `${base.stdout}/projects/${projectSlug(await $.session.root())}/memory`
}

// The "Style" tab: output styles are Markdown files in <config>/output-styles/; the active one is
// "outputStyle" in <config>/settings.json. A change reaches the model at the next session start.
const configDir = async ($: Engine) => (await $.process.run(['sh', '-c', 'printf %s "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"'])).stdout

const styleNotice = (ok: boolean, text: string) => (ok ? `✓ ${text}` : `✗ ${text}`)

const loadStyles = async ($: Engine) => {
  try {
    const base = await configDir($)
    const entries = (await $.fs.list(`${base}/output-styles`).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    const list: Style[] = []
    for (const f of entries) list.push(parseStyle(f.name, await $.fs.read(`${base}/output-styles/${f.name}`)))
    const active = activeStyle(await $.fs.read(`${base}/settings.json`).catch(() => ''))
    await update($, styles, () => list.sort((a, b) => a.name.localeCompare(b.name)))
    await update($, styleActive, () => active)
  } catch (err) {
    await update($, styleNote, () => styleNotice(false, `could not read the styles: ${(err as Error).message}`))
  }
  await update($, styleLoaded, () => true)
}

const openStyle = async ($: Engine, file: string) => {
  const s = (await read($, styles)).find(x => x.file === file)
  if (!s) return
  await update($, styleNote, () => '')
  await update($, styleDraft, () => ({ file, description: s.description, lines: s.body.split('\n'), dirty: false }))
}

const editStyle = ($: Engine, fn: (d: StyleDraft) => StyleDraft) => void update($, styleDraft, d => (d ? { ...fn(d), dirty: true } : d))

const saveStyle = async ($: Engine) => {
  const d = await read($, styleDraft)
  const s = d && (await read($, styles)).find(x => x.file === d.file)
  if (!d || !s) return
  try {
    await $.fs.write(`${await configDir($)}/output-styles/${s.file}`, buildStyle({ ...s, description: d.description, body: d.lines.join('\n') }))
    await loadStyles($)
    await update($, styleDraft, cur => (cur ? { ...cur, dirty: false } : cur))
    await update($, styleNote, () => styleNotice(true, 'saved'))
  } catch (err) {
    await update($, styleNote, () => styleNotice(false, `not saved: ${(err as Error).message}`))
  }
}

const useStyle = async ($: Engine, file: string) => {
  const s = (await read($, styles)).find(x => x.file === file)
  if (!s) return
  try {
    const path = `${await configDir($)}/settings.json`
    // Only a missing settings.json starts empty; a file that exists but cannot be read must not be overwritten.
    await $.fs.write(path, withOutputStyle((await $.fs.exists(path)) ? await $.fs.read(path) : '', s.name))
    await update($, styleActive, () => s.name)
    await update($, styleNote, () => styleNotice(true, `${s.name} is the output style from the next session`))
  } catch (err) {
    await update($, styleNote, () => styleNotice(false, `settings.json not changed: ${(err as Error).message}`))
  }
}

// A new style starts as a copy of the active one (or the first), so it is never an empty page.
const createStyle = async ($: Engine, name: string) => {
  const slug = slugName(name)
  const list = await read($, styles)
  if (!slug) return void (await update($, styleNote, () => styleNotice(false, 'give the style a name (letters or digits)')))
  if (list.some(s => s.file === `${slug}.md`)) return void (await update($, styleNote, () => styleNotice(false, `${slug}.md already exists`)))
  const active = await read($, styleActive)
  const from = list.find(s => s.name === active) ?? list[0]
  try {
    await $.fs.write(`${await configDir($)}/output-styles/${slug}.md`, buildStyle({ file: `${slug}.md`, name: slug, description: from?.description ?? '', keep: from?.keep ?? true, body: from?.body ?? '' }))
    await update($, styleFresh, () => '')
    await loadStyles($)
    await openStyle($, `${slug}.md`)
  } catch (err) {
    await update($, styleNote, () => styleNotice(false, `not created: ${(err as Error).message}`))
  }
}

// The "analyze" button. First the code: every path or symbol a memory names in backticks is looked up in the repo
// (tracked contents and file names), and what is gone becomes hard evidence. Then Sonnet reads each memory with that
// evidence, the project's CLAUDE.md and recent commits, and says whether it still helps here, with the body rewritten
// for a stale one. It only marks; "fix" and "delete" are clicks. Kept per project in $.store.
const auditKey = async ($: Engine) => `memaudit:${await $.session.root()}`

// ponytail: git grep on tracked files + file names; untracked work is invisible, a false "gone" reads as a hint, not a verdict
const isInRepo = async ($: Engine, root: string, r: Ref) => {
  if (r.kind === 'path') return $.fs.exists(`${root}/${r.needle}`)
  const res = await $.process.run(['sh', '-c', 'git -C "$1" grep -q -I -F -- "$2" || [ -n "$(git -C "$1" ls-files -- "*$2*")" ]', 'sh', root, r.needle], { timeoutMs: 10_000 }).catch(() => null)

  return res?.exitCode === 0
}

const checkRefs = async ($: Engine, root: string, list: Memory[], dir: string) => {
  const texts: Record<string, string> = {}
  const gone: Record<string, string[]> = {}
  const seen = new Map<string, boolean>()
  const isGit = (await git($, root, ['rev-parse', '--show-toplevel']).catch(() => ({ exitCode: 1 }))).exitCode === 0
  for (const m of list) {
    texts[m.name] = await $.fs.read(`${dir}/${m.file}`).catch(() => '')
    if (!isGit) continue
    for (const r of refsOf(parseMemory(m.file, texts[m.name] ?? '').body)) {
      if (!seen.has(r.ref)) seen.set(r.ref, await isInRepo($, root, r))
      if (!seen.get(r.ref)) (gone[m.name] ??= []).push(r.ref)
    }
  }

  return { texts, gone, checked: seen.size, isGit }
}

const analyzeMemories = async ($: Engine) => {
  const list = await read($, memories)
  const { dir } = await read($, memMeta)
  if (!list.length || (await read($, memAudit)).running) return
  await update($, memAudit, a => ({ ...a, running: true, note: '' }))
  try {
    const root = await $.session.root()
    const now = await $.clock.now()
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const { texts, gone, checked, isGit } = await checkRefs($, root, list, dir)
    const notes = list.map(m => {
      const evidence = gone[m.name]?.length ? `CODE CHECK: not in the repo any more: ${gone[m.name]!.map(r => `\`${r}\``).join(', ')}` : isGit ? 'CODE CHECK: every path and symbol it names still exists' : ''
      return `### ${m.name} (type ${m.type}, changed ${day(m.mtimeMs)})\n${evidence}\n${clip(parseMemory(m.file, texts[m.name] ?? '').body, 2500)}`
    })
    const guide = await $.fs.read(`${root}/CLAUDE.md`).catch(() => '')
    const log = await git($, root, ['log', '-25', '--format=%as %s']).catch(() => ({ stdout: '' }))
    const res = await $.model.complete({
      model: 'sonnet',
      maxTokens: 12_000,
      timeoutMs: 240_000,
      prompt: `You audit the persistent memory an AI coding agent keeps for one project. Each memory comes with a CODE CHECK: the paths and symbols it names that the repository no longer has (hard evidence: something was removed or renamed). For EACH memory decide:
- relevant: still true and useful when working on this project
- stale: about this project, but partly done, outdated, contradicted by the guide, the commits or the code check, or its dates have passed
- irrelevant: not about this project, of no use to the agent here, or entirely about things that no longer exist
Today is ${day(now)}. Project root: ${root}.
For a stale memory also write "fix": its body rewritten in Markdown, same language, with what no longer holds removed or corrected and what still holds kept (the **Why:** / **How to apply:** lines, the [[links]]); shorter is better. Leave "fix" empty for relevant and irrelevant.
Answer ONLY a JSON array, one entry per memory: [{"name": "<exact name>", "verdict": "relevant" | "stale" | "irrelevant", "why": "<at most 14 words, same language as the memories>", "fix": "<rewritten body or empty>"}]

Project guide (CLAUDE.md, start):
${clip(guide, 5000) || '(none)'}

Recent commits:
${log.stdout || '(none)'}

Memories:
${notes.join('\n\n')}`,
    })
    const verdicts = res.isAnswered ? parseVerdicts(res.text, list.map(m => m.name)) : {}
    for (const [name, v] of Object.entries(verdicts)) if (gone[name]?.length) v.gone = gone[name]
    const n = Object.keys(verdicts).length
    if (!n) return void (await update($, memAudit, a => ({ ...a, running: false, note: `✗ Sonnet gave no usable verdict${res.isAnswered ? '' : ` (${res.reason})`}` })))
    const note = [n < list.length ? `${list.length - n} memories got no verdict` : '', isGit ? `${checked} code references checked` : 'not a git repository: no code check'].filter(Boolean).join(' · ')
    await update($, memAudit, () => ({ at: now, running: false, note, verdicts }))
    await $.store.set(await auditKey($), { at: now, verdicts })
  } catch (err) {
    await update($, memAudit, a => ({ ...a, running: false, note: `✗ analysis failed: ${(err as Error).message}` }))
  }
}

const dropVerdict = async ($: Engine, names: string[]) => {
  await update($, memAudit, a => {
    const verdicts = { ...a.verdicts }
    for (const n of names) delete verdicts[n]
    return { ...a, verdicts }
  })
  const a = await read($, memAudit)
  await $.store.set(await auditKey($), { at: a.at, verdicts: a.verdicts })
}

// "delete": the file goes, and its line in MEMORY.md with it. Links from other memories stay and show as missing.
const deleteMemories = async ($: Engine, names: string[]) => {
  const { dir } = await read($, memMeta)
  const list = (await read($, memories)).filter(m => names.includes(m.name))
  if (!dir || !list.length) return
  try {
    const res = await $.process.run(['rm', '-f', '--', ...list.map(m => `${dir}/${m.file}`)])
    if (res.exitCode !== 0) throw new Error(res.stderr.trim() || `rm exited ${res.exitCode}`)
    const index = `${dir}/${INDEX}`
    if (await $.fs.exists(index)) await $.fs.write(index, list.reduce((t, m) => withoutIndexLine(t, m.file), await $.fs.read(index)))
    await dropVerdict($, names)
    await update($, memView, v => (v && names.includes(v.name) ? null : v))
    $.ui.toast(`Deleted ${list.length === 1 ? list[0]!.name : `${list.length} memories`}`)
  } catch (err) {
    await update($, memAudit, a => ({ ...a, note: `✗ not deleted: ${(err as Error).message}` }))
  }
  await loadMemories($)
}

// "fix": Sonnet's rewrite replaces the body; the frontmatter stays. The memory then counts as relevant.
const fixMemory = async ($: Engine, name: string) => {
  const { dir } = await read($, memMeta)
  const m = (await read($, memories)).find(x => x.name === name)
  const fix = (await read($, memAudit)).verdicts[name]?.fix
  if (!dir || !m || !fix) return
  try {
    await $.fs.write(`${dir}/${m.file}`, withBody(await $.fs.read(`${dir}/${m.file}`), fix))
    await update($, memAudit, a => ({ ...a, verdicts: { ...a.verdicts, [name]: { verdict: 'relevant', why: 'rewritten by the fix' } } }))
    const a = await read($, memAudit)
    await $.store.set(await auditKey($), { at: a.at, verdicts: a.verdicts })
    await update($, memView, v => (v?.name === name ? { name, body: clip(fix, 6000) } : v))
    $.ui.toast(`${name} rewritten`)
  } catch (err) {
    await update($, memAudit, a => ({ ...a, note: `✗ not rewritten: ${(err as Error).message}` }))
  }
  await loadMemories($)
}

// "unlink": every memory citing a memory that does not exist keeps the word, without the [[ ]].
const unlinkMemory = async ($: Engine, target: string) => {
  const { dir } = await read($, memMeta)
  const list = (await read($, memories)).filter(m => m.links.includes(target))
  if (!dir || !list.length) return
  try {
    for (const m of list) await $.fs.write(`${dir}/${m.file}`, withoutLink(await $.fs.read(`${dir}/${m.file}`), target))
    $.ui.toast(`[[${target}]] unlinked in ${list.length === 1 ? list[0]!.name : `${list.length} memories`}`)
  } catch (err) {
    await update($, memAudit, a => ({ ...a, note: `✗ not unlinked: ${(err as Error).message}` }))
  }
  await loadMemories($)
}

const copyMermaid = async ($: Engine, surface: any) => {
  const r = await $.ui.copy({ text: toMermaid(await read($, memories), (await read($, memAudit)).verdicts), surface })
  $.ui.toast(r.isCopied ? 'Mermaid copied: paste it into mermaid.live or a ```mermaid block' : `Not copied: ${r.reason}`)
}

const loadMemories = async ($: Engine) => {
  try {
    const usage = await $.session.usage({ breakdown: 'summary', columns: 60 })
    const context = (usage.context.breakdown?.memoryFiles ?? []).map(f => ({ path: f.path, type: f.type, tokens: f.tokens }))
    const dir = await memoryDir($, context)
    const entries = (await $.fs.list(dir).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    const index = entries.some(f => f.name === INDEX) ? parseIndex(await $.fs.read(`${dir}/${INDEX}`)) : {}
    const list: Memory[] = []
    for (const f of entries.filter(f => f.name !== INDEX)) {
      const m = parseMemory(f.name, await $.fs.read(`${dir}/${f.name}`))
      list.push({ name: m.name, file: f.name, type: m.type, description: m.description, links: m.links, indexed: f.name in index, hook: index[f.name]?.hook ?? '', size: f.size, mtimeMs: f.mtimeMs })
    }
    // The remember plugin keeps its log in the project (.remember/); the days are folded into a single row.
    const root = await $.session.root()
    const rem = (await $.fs.list(`${root}/.remember`).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    const days = rem.filter(f => f.name.startsWith('today-'))
    const remember = [
      ...rem.filter(f => !f.name.startsWith('today-')).map(f => ({ name: f.name, size: f.size })),
      ...(days.length ? [{ name: `today-*.md ×${days.length}`, size: days.reduce((n, f) => n + f.size, 0) }] : []),
    ]
    await update($, memories, () => list)
    await update($, memMeta, meta => ({ ...meta, dir, loaded: true, context, remember }))
    const saved = (await $.store.get(await auditKey($))) as Pick<MemoryAudit, 'at' | 'verdicts'> | undefined
    if (saved?.verdicts) await update($, memAudit, a => (a.at ? a : { ...a, at: saved.at, verdicts: saved.verdicts }))
  } catch {
    await update($, memMeta, meta => ({ ...meta, loaded: true }))
  }
}

const bump = ($: Engine, names: string[], key: keyof MemoryUse) =>
  update($, memUse, use => {
    const next = { ...use }
    for (const n of names) next[n] = { ...(next[n] ?? { read: 0, write: 0, recalled: 0 }), [key]: (next[n]?.[key] ?? 0) + 1 }

    return next
  })

const openMemory = async ($: Engine, name: string) => {
  const { dir } = await read($, memMeta)
  const m = (await read($, memories)).find(x => x.name === name)
  if (!m) return
  const text = await $.fs.read(`${dir}/${m.file}`).catch(() => '')
  await update($, memView, () => ({ name, body: clip(parseMemory(m.file, text).body, 6000) }))
  await update($, memDraft, () => null)
}

// Edit: the body in a field, written back under the same frontmatter.
const editMemory = async ($: Engine) => {
  const { dir } = await read($, memMeta)
  const v = await read($, memView)
  const m = v && (await read($, memories)).find(x => x.name === v.name)
  if (!m) return
  const text = await $.fs.read(`${dir}/${m.file}`).catch(() => '')
  await update($, memDraft, () => parseMemory(m.file, text).body)
}

const saveMemory = async ($: Engine) => {
  const { dir } = await read($, memMeta)
  const v = await read($, memView)
  const body = await read($, memDraft)
  const m = v && (await read($, memories)).find(x => x.name === v.name)
  if (!dir || !m || body === null) return
  try {
    await $.fs.write(`${dir}/${m.file}`, withBody(await $.fs.read(`${dir}/${m.file}`), body.trim()))
    await update($, memDraft, () => null)
    $.ui.toast(`${m.name} saved`)
  } catch (err) {
    $.ui.toast(`Not saved: ${(err as Error).message}`)
  }
  await loadMemories($)
  await openMemory($, m.name)
}

// Explain: Sonnet reads the memory and the ones it links to and says in a few plain sentences what it is for.
const explainMemory = async ($: Engine, name: string) => {
  const { dir } = await read($, memMeta)
  const list = await read($, memories)
  const m = list.find(x => x.name === name)
  if (!m || (await read($, memExplain))?.running) return
  await update($, memExplain, () => ({ name, running: true, text: '', note: '' }))
  let text = ''
  let note = ''
  try {
    const body = parseMemory(m.file, await $.fs.read(`${dir}/${m.file}`)).body
    const linked = list.filter(x => m.links.includes(x.name) || x.links.includes(name)).map(x => ({ name: x.name, description: x.description }))
    const res = await $.model.complete({ model: 'sonnet', effort: 'low', maxTokens: 500, timeoutMs: 60_000, prompt: explainPrompt(m, body, linked, await read($, prompt)) })
    text = res.isAnswered ? res.text.trim() : ''
    note = res.isAnswered ? '' : `✗ no explanation (${res.reason})`
  } catch (err) {
    note = `✗ no explanation (${(err as Error).message})`
  }
  await update($, memExplain, () => ({ name, running: false, text, note }))
}

// Per tool, with a matcher: the mod already has a matcher-less `tool.call`, and a second one is rejected.
const trackMemory: HookFor<'tool.call'> = async ($, e, next) => {
  const { dir } = await read($, memMeta)
  if (!dir) return next(e)
  const input = e as { file_path?: string; command?: string }
  const list = await read($, memories)
  const path = input.file_path ?? ''
  const isWrite = /^(Write|Edit)$/.test(String(e.tool))
  if (path.startsWith(`${dir}/`)) {
    const file = path.slice(dir.length + 1)
    const name = file === INDEX ? INDEX : (list.find(m => m.file === file)?.name ?? file.replace(/\.md$/, ''))
    await bump($, [name], isWrite ? 'write' : 'read')
  } else if (String(e.tool) === 'Bash' && input.command?.includes(dir)) {
    await bump($, namesIn(input.command, list), 'read')
  }
  const res = await next(e)
  if (isWrite && path.startsWith(`${dir}/`)) void loadMemories($)

  return res
}

// The switches the person flips are kept across sessions.
const flipCheck = async ($: Engine) => {
  const isOn = !(await read($, checkOn))
  await update($, checkOn, () => isOn)
  await $.store.set('check', isOn)
}

// At submit, Haiku reads the prompt alone and suggests in Flow what to clarify; the model's turn does not wait.
// A result for an older prompt is dropped.
const runCheck = async ($: Engine, text: string, previous: string, at: number) => {
  await update($, promptCheck, () => ({ at, running: true, clarity: 0, missing: [], questions: [], better: '', note: '' }))
  let found: PromptCheck | null = null
  let why = ''
  try {
    const res = await $.model.complete({ model: 'haiku', effort: 'low', maxTokens: 800, timeoutMs: 30_000, prompt: checkPrompt(text, previous) })
    found = res.isAnswered ? parseCheck(res.text, at) : null
    why = res.isAnswered ? '' : ` (${res.reason})`
  } catch (err) {
    why = ` (${(err as Error).message})`
  }
  await update($, promptCheck, cur => (cur?.at !== at ? cur : (found ?? { ...cur, running: false, note: `✗ haiku gave no check${why}` })))
  if (found && (await read($, promptCheck))?.at === at) {
    const asks = found.questions.length ? `, ${found.questions.length} question${found.questions.length > 1 ? 's' : ''}` : ''
    await logDid($, '✓', `Checked your prompt with Haiku: clarity ${found.clarity}/10${asks}${found.better ? ', finished it' : ''}`, 'ok')
  }
}

const copyText = async ($: Engine, text: string, surface: any) => {
  const r = await $.ui.copy({ text, surface })
  $.ui.toast(r.isCopied ? 'Prompt copied' : `Not copied: ${r.reason}`)
}

// The "Hooks" tab: Claude Code's own hooks in the settings files. Global (<config>/settings.json) only turns on/off;
// the project's (.claude/settings.json shared, .claude/settings.local.json just you) take any change.
const readSettings = async ($: Engine, file: string) => parseSettings((await $.fs.exists(file)) ? await $.fs.read(file) : '')

const loadHooks = async ($: Engine) => {
  const rows: HookRow[] = []
  const bad: string[] = []
  try {
    const root = await $.session.root()
    const global = `${await configDir($)}/settings.json`
    const project = `${root}/.claude/settings.json`
    // A session started in the config dir's parent has no project of its own.
    const paths: HookPaths = project === global ? { global, project: '', local: '' } : { global, project, local: `${root}/.claude/settings.local.json` }
    await update($, hookPaths, () => paths)
    for (const scope of ['global', 'project', 'local'] as const) {
      if (!paths[scope]) continue
      for (const isOff of [false, true]) {
        const path = isOff ? offFile(paths[scope]) : paths[scope]
        try {
          rows.push(...rowsOf(await readSettings($, path), scope, paths[scope], isOff))
        } catch (err) {
          bad.push(`${path}: ${(err as Error).message}`)
        }
      }
    }
  } catch (err) {
    bad.push((err as Error).message)
  }
  await update($, hookRows, () => rows)
  if (bad.length) await update($, hookNote, () => `✗ not read, left alone: ${bad.join('; ')}`)
  await update($, hooksLoaded, () => true)
}

const GONE = 'the file changed since the tab read it: reloaded, try again'

const refOf = (r: HookRow): HookRef => ({ event: r.event, matcher: r.matcher, hook: r.hook })

// Every change re-reads the hook's file and its *.hooks-off.json, so an edit made elsewhere meanwhile is never
// overwritten (a hook no longer there is refused), and writes only the files that changed.
const changeHooks = async ($: Engine, file: string, change: (on: Settings, off: Settings) => [Settings, Settings] | string, done: string) => {
  try {
    const on = await readSettings($, file)
    const off = await readSettings($, offFile(file))
    const out = change(on, off)
    if (typeof out === 'string') {
      await update($, hookNote, () => `✗ ${out}`)
    } else {
      if (serialize(out[0]) !== serialize(on)) await $.fs.write(file, serialize(out[0]))
      if (serialize(out[1]) !== serialize(off)) await $.fs.write(offFile(file), serialize(out[1]))
      await update($, hookDraft, () => null)
      await update($, hookNote, () => `✓ ${done} · Claude Code reads it from the next session`)
    }
  } catch (err) {
    await update($, hookNote, () => `✗ ${file} not changed: ${(err as Error).message}`)
  }
  await loadHooks($)
}

const toggleHook = ($: Engine, r: HookRow) =>
  changeHooks(
    $,
    r.file,
    (on, off) => {
      const ref = refOf(r)
      if (!hasHook(r.isOff ? off : on, ref)) return GONE

      return r.isOff ? [withHook(on, ref), withoutHook(off, ref)] : [withoutHook(on, ref), withHook(off, ref)]
    },
    `${r.event} ${r.isOff ? 'on' : 'off'}`,
  )

// Global hooks are only turned on/off here, never deleted.
const removeHook = async ($: Engine, r: HookRow) => {
  if (r.scope === 'global') return
  await changeHooks(
    $,
    r.file,
    (on, off) => {
      const ref = refOf(r)
      if (!hasHook(r.isOff ? off : on, ref)) return GONE

      return r.isOff ? [on, withoutHook(off, ref)] : [withoutHook(on, ref), off]
    },
    `${r.event} deleted`,
  )
}

const saveHook = async ($: Engine) => {
  const d = await read($, hookDraft)
  if (!d || d.row?.scope === 'global') return
  const timeout = d.timeout.trim()
  if (!d.text.trim()) return void (await update($, hookNote, () => '✗ write what the hook runs'))
  if (timeout && !/^[1-9]\d*$/.test(timeout)) return void (await update($, hookNote, () => '✗ timeout: whole seconds'))
  const next: HookRef = { event: d.event, matcher: d.matcher.trim(), hook: hookFromDraft(d.row?.hook, d.text, timeout) }
  const row = d.row
  if (!row) {
    const file = (await read($, hookPaths))[d.scope]
    if (!file) return void (await update($, hookNote, () => '✗ this session has no project folder'))

    return changeHooks($, file, (on, off) => [withHook(on, next), off], `${next.event} added`)
  }
  const old = refOf(row)

  return changeHooks(
    $,
    row.file,
    (on, off) => {
      if (!hasHook(row.isOff ? off : on, old)) return GONE

      return row.isOff ? [on, replaceHook(off, old, next)] : [replaceHook(on, old, next), off]
    },
    `${next.event} saved`,
  )
}

const openHook = async ($: Engine, r: HookRow | null) => {
  await update($, hookNote, () => '')
  await update($, hookDraft, () =>
    r
      ? { row: r, scope: r.scope === 'project' ? ('project' as const) : ('local' as const), event: r.event, matcher: r.matcher, text: mainText(r.hook), timeout: r.hook.timeout === undefined ? '' : String(r.hook.timeout) }
      : { row: null, scope: 'local' as const, event: 'PreToolUse', matcher: '', text: '', timeout: '' },
  )
}

// The main loop's steps run at the message's picked effort. At the turn's first step the pick learns the level it
// starts from and the model (for the tip); a level the person set to xhigh or max is never lowered.
// Setup: one value changed, kept across sessions.
const setSetup = async ($: Engine, patch: Partial<Setup>) => {
  const next = { ...(await read($, setup)), ...patch }
  await update($, setup, () => next)
  await $.store.set('setup', next)
}

const THRESHOLD_CHOICES: Partial<Record<keyof Setup, readonly number[]>> = { handoffAt: [70, 80, 90], cacheTtlMin: [5, 60], cacheWarnS: [30, 60, 120], holdWords: [30, 40, 60] }
const nextThreshold = async ($: Engine, key: keyof Setup) => {
  const choices = THRESHOLD_CHOICES[key]
  if (choices) await setSetup($, { [key]: cycle(choices, (await read($, setup))[key] as number) })
}

// Setup · Other plugins: settings.json enabledPlugins, read and switched in place.
const settingsFile = async ($: Engine) => `${await configDir($)}/settings.json`
const loadPlugins = async ($: Engine) => {
  let o: { enabledPlugins?: Record<string, boolean> } = {}
  try {
    const file = await settingsFile($)
    if (await $.fs.exists(file)) o = JSON.parse(await $.fs.read(file))
  } catch {
    o = {}
  }
  await update($, plugins, () => Object.entries(o.enabledPlugins ?? {}).map(([id, on]) => ({ id, on: on === true })))
}
const flipPlugin = async ($: Engine, id: string) => {
  const file = await settingsFile($)
  const o = JSON.parse(await $.fs.read(file)) as { enabledPlugins?: Record<string, boolean> }
  const on = !(o.enabledPlugins?.[id] === true)
  o.enabledPlugins = { ...o.enabledPlugins, [id]: on }
  await $.fs.write(file, `${JSON.stringify(o, null, 2)}\n`)
  await loadPlugins($)
  $.ui.toast(`${id.split('@')[0]} ${on ? 'on' : 'off'}: /reload-plugins to apply`)
}

// Reflect: a correction (found in the words, free) goes to Haiku, which keeps it only as a lasting rule.
const runReflect = async ($: Engine, text: string, at: number) => {
  const said = (await read($, steps)).filter(s => !s.agentId && s.answer).at(-1)?.answer ?? ''
  await update($, reflect, () => ({ at, text, rule: '', running: true, state: 'open' as const, note: '' }))
  let rule = ''
  try {
    const res = await $.model.complete({ model: 'haiku', effort: 'low', maxTokens: 120, timeoutMs: 30_000, prompt: rulePrompt(text, said) })
    rule = res.isAnswered ? parseRule(res.text) : ''
  } catch {
    rule = ''
  }
  await update($, reflect, r => (r?.at !== at ? r : rule ? { ...r, rule, running: false } : null))
  if (rule) await logDid($, '✎', `You corrected Claude: offered to save „${clip(rule, 60)}” as a rule`, 'info')
}

// The rule goes into the project's CLAUDE.md or the global one (<config>/CLAUDE.md), under its own heading.
const saveRule = async ($: Engine, where: 'project' | 'all') => {
  const r = await read($, reflect)
  if (!r?.rule) return
  const file = where === 'project' ? `${await $.session.root()}/CLAUDE.md` : `${await configDir($)}/CLAUDE.md`
  const body = (await $.fs.exists(file)) ? await $.fs.read(file) : ''
  await $.fs.write(file, withRule(body, r.rule))
  await update($, reflect, x => (x ? { ...x, state: 'saved' as const, note: file } : x))
  $.ui.toast(`Rule saved to ${where === 'project' ? 'this project' : 'every project'}`)
}

const writeHandoff = async ($: Engine) => {
  await logDid($, '⇢', 'Asked Claude for a handoff prompt (context almost full)', 'info')
  await $.prompt.submit({ text: HANDOFF_PROMPT })
}

const keepWarm = async ($: Engine) => {
  await logDid($, '◔', 'Kept the prompt cache warm', 'info')
  await $.prompt.submit({ text: 'Agent Lens keep-alive: reply with just "ok".' })
}

// The Chat tab's replay: one edit per step, back, forward, or all of them one after another.
let replayTimer: { cancel: () => void } | null = null
const stepEdit = async ($: Engine, by: number) => {
  const list = await read($, edits)
  const n = list.filter(x => x.at === list.at(-1)?.at).length
  await update($, editIdx, i => Math.max(0, Math.min(n - 1, i + by)))
}
const replayEdits = async ($: Engine) => {
  replayTimer?.cancel()
  await update($, editIdx, () => 0)
  replayTimer = $.clock.every(1200, () => {
    void (async () => {
      const list = await read($, edits)
      const n = list.filter(x => x.at === list.at(-1)?.at).length
      if ((await read($, editIdx)) >= n - 1) {
        replayTimer?.cancel()
        replayTimer = null
      } else await stepEdit($, 1)
    })()
  })
}

// Files the chat read or wrote, and each edit of the turn (for the replay).
const trackFile = async ($: Engine, e: { tool: string; [key: string]: unknown }) => {
  const path = typeof e.file_path === 'string' ? e.file_path : typeof e.notebook_path === 'string' ? e.notebook_path : ''
  if (!path || !/^(Read|Write|Edit|NotebookEdit)$/.test(e.tool)) return
  const isRead = e.tool === 'Read'
  await update($, files, list => {
    const old = list.find(f => f.path === path)
    const row = { path, read: (old?.read ?? 0) + (isRead ? 1 : 0), wrote: (old?.wrote ?? 0) + (isRead ? 0 : 1) }

    return [...list.filter(f => f.path !== path), row].slice(-80)
  })
  if (isRead) return
  const at = await read($, turnAt)
  const rec: EditRec = { at, path, old: clip(String(e.old_string ?? ''), 2000), new: clip(String(e.new_string ?? e.content ?? e.new_source ?? ''), 2000) }
  await update($, edits, list => [...list.filter(x => x.at === at), rec].slice(-40))
}

type StepIn = Parameters<HookFor<'turn.step'>>[1]
const withEffort = async ($: Engine, e: StepIn): Promise<StepIn> => {
  const from = asLevel(e.effort)
  const p = e.agentId ? null : await read($, effortPick)
  if (!p || p.turnId !== e.turnId || !from) return e
  if (p.from === undefined) {
    if (rank(from) >= rank('xhigh') && rank(p.level) < rank(from)) {
      await update($, effortPick, () => null)

      return e
    }
    const tip = tipFor(p.level, e.model, e.index === 0 && e.messageCount <= 2)
    const isApplied = p.mode === 'auto'
    await update($, effortPick, cur => (cur ? { ...cur, from, model: e.model, tip, isApplied } : cur))
    if (p.level !== from) {
      await logDid($, '✓', isApplied ? `Effort ${p.level} for this message (was ${from}): ${p.why}` : `Effort ${p.level} would fit (you're on ${from}): ${p.why}`, 'run')
    }
    await logDid($, tip ? '?' : '✓', tip ? `Model tip: ${tip.label}, ${tip.note}` : `Kept ${short(e.model)}: it fits this message`, tip ? 'info' : 'ok')
  }
  const now = await read($, effortPick)

  return now && now.turnId === e.turnId && now.isApplied && now.level !== from ? { ...e, effort: now.level } : e
}

export const register: Register = on => {
  // Memory usage: reads and writes through tools (including subagents'), recalls through attachments.
  on('tool.call', { tool: 'Read' }, trackMemory)
  on('tool.call', { tool: 'Write' }, trackMemory)
  on('tool.call', { tool: 'Edit' }, trackMemory)
  on('tool.call', { tool: 'Bash' }, trackMemory)

  on('prompt.attachment', async ($, e, next) => {
    const res = await next(e)
    const text = (e as { text?: string }).text ?? ''
    if (/memor/i.test(e.type) && text) {
      const names = namesIn(text, await read($, memories))
      await update($, memMeta, meta => ({ ...meta, recalls: [...meta.recalls, { type: e.type, names }].slice(-20) }))
      if (names.length) await bump($, names, 'recalled')
    }

    return res
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lens', description: 'Open the Agent Lens sidebar' })
    await $.command.register({ name: 'replay', description: "Replay the last turn's edits in Agent Lens" })
    const saved = setupOf(await $.store.get('setup'))
    await update($, setup, () => saved)
    // The band's clock (cache countdown): only the band reads `tick`, so only the band redraws.
    $.clock.every(5000, () => void (async () => {
      const t = await $.clock.now()
      await update($, tick, () => t)
    })())
    await $.tool.register({ name: PLAN_TOOL, description: PLAN_DESCRIPTION, inputSchema: PLAN_SCHEMA, isDeferred: false })
    void refreshChanges($)
    void loadMemories($)
    void loadStyles($)
    // The prompt check stays on until the person turns it off.
    const check = await $.store.get('check')
    await update($, checkOn, () => check !== false)
    const effort = await $.store.get('effort')
    await update($, effortMode, () => (effort === 'tip' || effort === 'off' ? effort : 'auto'))
    const hold = await $.store.get('hold')
    await update($, holdOn, () => hold !== false)
    await update($, hasGraph, () => false)
    if (await $.fs.exists('.codegraph')) await update($, hasGraph, () => true)
    void $.ui.open({ id: PANE, title: 'Agent Lens' })

    return next(e)
  })

  on('command.run', { command: 'lens' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agent Lens', focus: true })

    return { text: 'Agent Lens opened.' }
  })

  on('command.run', { command: 'replay' }, async $ => {
    await update($, tab, () => 'chat' as Tab)
    await $.ui.open({ id: PANE, title: 'Agent Lens', focus: true })
    void replayEdits($)

    return { text: "Replaying the last turn's edits in Agent Lens · Chat." }
  })

  // A prompt sent by a human counts as "requested": the panel settles at any width,
  // and if it was closed by hand, it comes back. On an already open id it's a no-op.
  on('prompt.submit', async ($, e, next) => {
    // A `!` shell command or a local command's echo is not a request: it leaves the turn's state alone.
    if (/^\s*<(bash-|local-command|command-)/.test(e.text)) return next(e)
    void $.ui.open({ id: PANE, title: 'Agent Lens' })
    const now = await $.clock.now()
    // A held prompt sent from Flow comes back through $.prompt.submit: it is still the person's own.
    const isReleased = e.text !== '' && e.text === (await read($, released))
    if (isReleased) await update($, released, () => '')
    const isTyped = !e.origin || e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    const isHuman = isTyped || isReleased
    const heldNow = await read($, held)
    // Enter on the text that was held sends it as is; a held prompt already had its check.
    const wasHeld = heldNow !== null && heldNow.text === e.text
    const previous = await read($, prompt)
    const own = ownText(e.text)
    const isFresh = isHuman && !isReleased && !wasHeld
    if (isFresh) {
      await update($, graphSeen, () => false)
      await update($, planAsked, () => false)
      await update($, turnAt, () => now)
      await update($, plan, () => null)
      await update($, answers, () => ({}))
      await update($, folds, () => ({}))
      await update($, promptCheck, () => null)
      await update($, did, () => [])
      await update($, stageView, () => null)
      await update($, bandHidden, () => false)
      await update($, reflect, () => null)
      if ((await read($, setup)).reflect && isCorrection(own)) void runReflect($, own, now)
    }
    // Before you send: a long typed prompt stops once, goes back into the box (nothing is lost) and Haiku reads
    // it; Flow offers the finished prompt. If the box cannot take it back, the prompt goes out as usual.
    // A prompt this long (Setup · holdWords) is held for a look before it is sent (once: Enter on the same text sends it).
    const isLong = own.split(/\s+/).length >= (await read($, setup)).holdWords
    if (isFresh && isTyped && e.command === undefined && isLong && worthChecking(own) && (await read($, holdOn)) && (await read($, checkOn))) {
      const back = await $.prompt.fill({ text: e.text, mode: 'replace' }).catch(() => null)
      if (back?.isFilled) {
        await update($, held, () => ({ text: e.text, at: now }))
        await update($, prompt, () => own)
        await logDid($, '⏸', 'Held your long prompt for a look before sending', 'run')
        void runCheck($, own, previous, now)
        void $.ui.open({ id: PANE, title: 'Agent Lens' })

        return { drop: 'Agent Lens: held for a look first (Flow). Press Enter to send it as is.' }
      }
    }
    if (wasHeld) await logDid($, '✓', 'Sent your prompt as you wrote it', 'ok')
    if (isHuman) {
      await update($, held, () => null)
      // The effort for this message, from its words; it meets its turn at turn.start.
      const mode = await read($, effortMode)
      const pick = mode === 'off' ? null : pickFor(own)
      await update($, effortPick, () => (pick ? { ...pick, at: now, text: e.text, tip: null, isApplied: false, mode } : null))
    }
    await update($, busy, () => true)
    await update($, prompt, () => own)
    if (isFresh && (await read($, checkOn)) && worthChecking(own)) void runCheck($, own, previous, now)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, effortPick, p => (p && !p.turnId && (p.text === e.text || now - p.at <= PICK_MS) ? { ...p, turnId: e.turnId } : p))
    }

    return next(e)
  })

  // The mod's rules go into the system prompt: the miniplan first, CodeGraph before Grep/Read when the
  // project has an index, the reply language. No model routing: the session model does the work.
  on('prompt.compose', async ($, e, next) => {
    const res = await next(e)
    const extra = []
    if (await read($, planFirst)) extra.push({ id: 'agent-lens:plan', scope: 'session' as const, text: PLAN_RULE })
    if ((await read($, hasGraph)) && (await read($, graphFirst))) {
      extra.push({
        id: 'agent-lens:codegraph',
        scope: 'session' as const,
        text: 'The project has a CodeGraph index (.codegraph/). For any question about code and before any change, call codegraph_explore first (verbatim source, callers, blast radius); use Grep, Glob and Read only for what it does not cover. Tell subagents to use it too.',
      })
    }
    extra.push({
      id: 'agent-lens:language',
      scope: 'session' as const,
      text: "Reply to the user in the language of their latest prompt (Romanian prompt → Romanian reply, English prompt → English reply), including the fields you pass to the plan tool. Keep code, identifiers and commands as they are.",
    })

    return extra.length ? { sections: [...res.sections, ...extra] } : res
  })

  on('skill.prompt', async ($, e, next) => {
    await update($, skillsUsed, used => ({ ...used, [e.skill]: (used[e.skill] ?? 0) + 1 }))

    return next(e)
  })

  // The model's plan lands in the Flow tab; a republish keeps its place and bumps the revision.
  // The literal (not the constant) so the validator sees the matcher; `as never` until the MCP types generated on load include the tool.
  on('tool.call', { tool: 'mcp__agent-lens__plan' as never }, async ($, e) => {
    const fresh = normalizePlan(e, await $.clock.now())
    await update($, plan, old => ({ ...fresh, revision: old ? old.revision + 1 : 0 }))

    return { result: `Plan shown in Agent Lens · Flow (${fresh.steps.length} steps).` }
  })

  on('tool.call', async ($, e, next) => {
    const name = toolLabel(String(e.tool))
    await update($, toolCounts, counts => ({ ...counts, [name]: (counts[name] ?? 0) + 1 }))
    if (name.startsWith('codegraph:')) await update($, graphSeen, () => true)
    // The miniplan comes before any tool: the first tool of a turn without a published plan is denied once.
    if (!e.agentId && String(e.tool) !== PLAN_TOOL_ID && (await read($, planFirst)) && !(await read($, plan)) && !(await read($, planAsked))) {
      await update($, planAsked, () => true)
      await logDid($, '✓', 'Asked Claude for its plan before the first tool', 'ok')

      return { deny: `Publish the miniplan with ${PLAN_TOOL_ID} first: what you understood (goal) and how you will act (approach), with the steps. Then repeat the tool.` }
    }
    // The turn's first classic search, without CodeGraph before it, is denied once; the second goes through.
    if (!e.agentId && /^(Grep|Glob)$/.test(String(e.tool)) && (await read($, hasGraph)) && (await read($, graphFirst)) && !(await read($, graphSeen))) {
      await update($, graphSeen, () => true)
      await logDid($, '✓', 'Sent Claude to CodeGraph before a plain search', 'ok')

      return { deny: 'The project has a CodeGraph index: start with codegraph_explore (verbatim source and callers in a single call). If it does not cover what you are looking for, repeat Grep/Glob.' }
    }
    if (e.agentId) {
      await update($, workers, list =>
        list.map(w => (w.agentId === e.agentId ? { ...w, tools: w.tools + 1 } : w)),
      )
    }

    const res = await next(e)
    if (res.deny === undefined && !res.isError) await trackFile($, e as never)
    if (e.agentId || res.deny !== undefined || res.isError) return res
    const at = await $.clock.now()
    const mirrored = mirrorTodos(await read($, plan), String(e.tool), e, at)
    if (mirrored) await update($, plan, () => mirrored)
    const text = await takeAnswers($)

    return text ? { ...res, context: [...(res.context ?? []), text] } : res
  })

  // Every step of the main loop and of the subagents, with its model, tools, tokens and cost.
  on('turn.step', async function* ($, e0, next) {
    const e = await withEffort($, e0)
    const id = `${e.turnId}:${e.agentId ?? 'main'}:${e.index}`
    const step: Step = {
      id,
      turnId: e.turnId,
      index: e.index,
      model: e.model,
      effort: e.effort === undefined ? undefined : String(e.effort),
      agentId: e.agentId,
      isDone: false,
      tools: [],
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
      stop: null,
      answer: '',
      uses: [],
    }
    await update($, steps, list => [...list, step].slice(-60))

    const res = yield* next(e)

    const usage = res.usage
    const cost = usage ? costOf(tierOf(usage.model ?? e.model) ?? 'opus', usage) : 0
    await update($, steps, list =>
      list.map(s =>
        s.id === id
          ? {
              ...s,
              isDone: true,
              model: usage?.model ?? s.model,
              tools: res.toolUses.map(u => toolLabel(u.name)),
              tokensIn: usage ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : 0,
              tokensOut: usage?.output_tokens ?? 0,
              cacheRead: usage?.cache_read_input_tokens ?? 0,
              cost,
              stop: res.stopReason,
              answer: clip(res.answer, 4000),
              uses: res.toolUses.map(u => ({ tool: u.name, brief: brief(u.input) })),
            }
          : s,
      ),
    )

    if (usage) {
      await update($, totals, t => ({
        steps: t.steps + 1,
        tokensIn: t.tokensIn + usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
        tokensOut: t.tokensOut + usage.output_tokens,
        cacheRead: t.cacheRead + usage.cache_read_input_tokens,
        cost: (t.cost ?? 0) + cost,
      }))
    }

    return res
  })

  // A subagent runs on the model the main model asked for, or inherits its parent's; the mod only watches.
  on('agent.spawn', async ($, e, next) => {
    const id = e.tool_use_id || `${e.subagentType}:${await $.clock.now()}`
    const worker: Worker = {
      id,
      type: e.subagentType,
      description: e.description,
      model: e.model ?? e.parentModel,
      parentModel: e.parentModel,
      isBackground: Boolean(e.background),
      status: 'running',
      startedAt: await $.clock.now(),
      tools: 0,
      prompt: clip(e.prompt, 1500),
      planStep: await (async () => {
        const steps = (await read($, plan))?.steps ?? []
        const i = steps.findIndex(s => s.status === 'run')

        return i < 0 ? undefined : `${i + 1} · ${steps[i]?.title}`
      })(),
    }
    void $.ui.open({ id: PANE, title: 'Agent Lens' })
    await update($, workers, list => [...list, worker].slice(-30))

    const res = await next(e)

    await update($, workers, list =>
      list.map(w =>
        w.id === id
          ? res.deny !== undefined
            ? { ...w, status: 'denied' as const }
            : { ...w, agentId: res.agentId, model: res.model }
          : w,
      ),
    )

    return res
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      void refreshChanges($)
      await update($, busy, () => false)
      const idle = await $.clock.now()
      await update($, idleAt, () => idle)
      // Questions left unanswered: the model went with its default, said once per question.
      const answeredNow = await read($, answers)
      const asked = [...((await read($, promptCheck))?.questions ?? []), ...((await read($, plan))?.questions ?? [])]
      const logged = new Set((await read($, did)).map(d => d.text))
      for (const q of asked.filter((q, i) => !answeredNow[q.ask] && asked.findIndex(x => x.ask === q.ask) === i && q.fallback !== '')) {
        const text = `No answer to „${clip(q.ask, 50)}”: Claude went with ${q.fallback}`
        if (!logged.has(text)) await logDid($, '·', text)
      }
      await submitAnswers($)
    }

    if (e.agentId) {
      await update($, workers, list =>
        list.map(w =>
          w.agentId === e.agentId
            ? {
                ...w,
                answer: e.answer ? clip(e.answer, 1500) : undefined,
                status: e.isAborted ? ('aborted' as const) : ('done' as const),
                durationMs: e.durationMs,
                tokensOut: e.usage?.output_tokens,
              }
            : w,
        ),
      )
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Code } = $.ui.resolve(e)
    const list = await read($, changes)
    const repoNow = await read($, repo)
    const message = await read($, commitMsg)
    const note = await read($, gitNote)
    const diffNow = await read($, diff)
    // Steps from before a reload have no `answer`/`uses`: their absence must not block the panel.
    const opened = await read($, stepView)
    const stepNow = opened && { ...opened, answer: opened.answer ?? '', uses: opened.uses ?? [] }
    const isDrafting = await read($, drafting)
    const planNow = await read($, plan)
    const answered = await read($, answers)
    const isSyncing = await read($, syncing)
    const graphReady = await read($, hasGraph)
    const isGraphFirst = await read($, graphFirst)
    const allSteps = await read($, steps)
    const allWorkers = await read($, workers)
    const used = await read($, skillsUsed)
    const counts = await read($, toolCounts)
    const lastPrompt = await read($, prompt)
    // A tab saved by an older version (Steps, Skills) falls back to Flow.
    const stored = String(await read($, tab))
    const current: Tab = ['think', 'agents', 'chat', 'changes', 'memories', 'setup', 'styles', 'hooks'].includes(stored) ? (stored as Tab) : 'think'
    const foldNow = await read($, folds)
    const sessionModel = await $.session.model()
    const sum = await read($, totals)
    const isBusy = await read($, busy)
    const isPlanFirst = await read($, planFirst)
    const isChecking = await read($, checkOn)
    const checkNow = await read($, promptCheck)
    const since = await read($, turnAt)
    const effortNow = await read($, effortPick)
    const effortModeNow = await read($, effortMode)
    const didNow = await read($, did)
    const heldNow = await read($, held)
    const isHolding = await read($, holdOn)
    const stageNow = await read($, stageView)
    const setupNow = await read($, setup)
    const reflectNow = await read($, reflect)
    // The terminal's table answers every name (a missing element builds an empty Box): Svg only off the terminal.
    const resolved = $.ui.resolve(e) as ReturnType<typeof $.ui.resolve> & { Svg?: any }
    const ui = { ...resolved, Svg: e.surface === 'terminal' ? undefined : resolved.Svg }
    const { context, rateLimits } = await $.session.usage()
    const now = await $.clock.now()
    const room = Math.max(6, (e.viewport?.rows ?? 30) - 12)

    const mainSteps = allSteps.filter(s => !s.agentId)
    const last = mainSteps.at(-1)
    const turnId = last?.turnId
    const turnSteps = allSteps.filter(s => s.turnId === turnId || (s.agentId && allWorkers.some(w => w.agentId === s.agentId && w.status === 'running')))
    const tokensIn = turnSteps.reduce((n, s) => n + s.tokensIn, 0)
    const tokensOut = turnSteps.reduce((n, s) => n + s.tokensOut, 0)
    const cacheRead = turnSteps.reduce((n, s) => n + s.cacheRead, 0)
    const turnCost = turnSteps.reduce((n, s) => n + (s.cost ?? 0), 0)
    const running = allWorkers.filter(w => w.status === 'running').length
    const workerType = (agentId: string) => allWorkers.find(w => w.agentId === agentId)?.type ?? 'worker'

    const five = rateLimits.find(r => r.kind === 'five_hour')
    const header = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.accent} paddingX={1}>
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text weight="bold" color={C.accent}>◆ AGENT LENS</Text>
          </Text>
          <Box gap={1}>
            <Text color={running ? C.run : C.ok}>{running ? `● ${running} worker${running > 1 ? 's' : ''}` : '○ idle'}</Text>
            {/* Output styles: a small icon, not a tab; pressed again it goes back to Flow. */}
            <Button
              key="tab-styles"
              plain
              label={current === 'styles' ? '[Aa]' : 'Aa'}
              onPress={() => {
                void update($, tab, () => (current === 'styles' ? 'think' : 'styles'))
                if (current !== 'styles') void loadStyles($)
              }}
            />
          </Box>
        </Box>
        {/* How much room is left (context, 5h from /usage) and what it costs (API list prices: on a
            subscription a measure, not the bill). */}
        {tiles(ui, 'head', [
          { label: 'turn', value: usd(turnCost), color: 'yellow' },
          { label: 'session', value: usd(sum.cost ?? 0), color: 'yellow' },
          { label: 'context', value: `${context.percent ?? '—'}%`, color: pctColor(context.percent ?? 0, 85) },
          { label: five?.resetsAt ? `5h · ${until(Date.parse(five.resetsAt) - now)}` : '5h', value: five ? `${five.percentUsed}%` : '—', color: five ? pctColor(five.percentUsed, 90) : undefined },
        ])}
        <Box gap={1}>
          <Button key="planfirst" plain dimColor={!isPlanFirst} label={`${isPlanFirst ? '✓' : '○'} miniplan`} onPress={() => update($, planFirst, v => !v)} />
          <Button key="check" plain dimColor={!isChecking} label={`${isChecking ? '✓' : '○'} prompt check`} onPress={() => void flipCheck($)} />
          {graphReady && <Button key="graph" plain dimColor={!isGraphFirst} label={`${isGraphFirst ? '✓' : '○'} graph first`} onPress={() => update($, graphFirst, v => !v)} />}
        </Box>
      </Box>
    )

    const tabs = (
      <Box gap={1}>
        {(
          [
            ['think', 'Flow', 'f'],
            ['agents', running ? `Agents ●${running}` : 'Agents', 'w'],
            ['chat', 'Chat', 'i'],
            ['changes', `Git ${list.length}`, 'c'],
            ['memories', 'Memories', 'e'],
            ['setup', 'Setup', 'o'],
          ] as [Tab, string, string][]
        ).map(([id, label, hotkey]) => (
          <Button
            key={`tab-${id}`}
            label={label}
            hotkey={hotkey}
            variant={current === id || (id === 'setup' && (current === 'hooks' || current === 'styles')) ? 'primary' : 'secondary'}
            onPress={() => {
              void update($, tab, () => id)
              if (id === 'changes') void refreshChanges($)
              if (id === 'memories') void loadMemories($)
              if (id === 'setup') {
                void loadPlugins($)
                void loadHooks($)
                void loadStyles($)
              }
            }}
          />
        ))}
      </Box>
    )

    const toolIcon = (name: string) =>
      name.startsWith('codegraph:') ? '◈' : /^(Read|Grep|Glob)$/.test(name) ? '⌕' : EDIT_TOOLS.has(name) ? '✎' : name === 'Bash' ? '$' : /^(Agent|Task)$/.test(name) ? '⤷' : name === 'Skill' ? '✦' : '•'
    const toolColor = (name: string) => (name.startsWith('codegraph:') ? C.graph : EDIT_TOOLS.has(name) ? C.run : name === 'Skill' ? C.info : undefined)
    const chips = (tools: string[]) => {
      const counts = new Map<string, number>()
      for (const name of tools) counts.set(name, (counts.get(name) ?? 0) + 1)

      return [...counts].map(([name, n]) => (
        <Text key={name} color={toolColor(name)} bold={name.startsWith('codegraph:')}>
          {toolIcon(name)} {name.replace(/^codegraph:(codegraph_)?/, 'graph:')}
          {n > 1 ? `×${n}` : ''}{' '}
        </Text>
      ))
    }

    const turnTools = turnSteps.flatMap(s => s.tools)
    const graphN = turnTools.filter(t => t.startsWith('codegraph:')).length
    const classicN = turnTools.filter(t => /^(Read|Grep|Glob)$/.test(t)).length
    const graphCells = graphN + classicN === 0 ? 0 : Math.round((graphN / (graphN + classicN)) * 10)
    const turnWorkers = allWorkers.filter(w => w.startedAt >= since)

    // Everything foldable: sections, plan steps, execution steps. A missing key = the default state.
    const isOpen = (key: string, byDefault: boolean) => foldNow[key] ?? byDefault
    const toggle = (key: string, open: boolean) => void update($, folds, f => ({ ...f, [key]: open }))
    const fold = { isOpen, toggle }
    const section = (key: string, title: string, byDefault: boolean, body: () => RenderChildren, aside?: RenderChildren) => kitSection({ Box, Text, Button }, fold, key, title, byDefault, body, aside)

    // The Flow tab: a stage line, what needs the person first, how the model understood the request, the plan
    // by level (steps on the same level run in parallel: ┬ ├ └) and what was actually executed, step by step.
    const STATUS_MARK = { todo: ['○', undefined], run: ['●', C.run], done: ['✓', C.ok], skip: ['⊘', undefined] } as const
    const WORKER_COLOR = { running: C.run, done: C.ok, aborted: C.bad, denied: C.bad } as const
    const sessionTier = tierOf(String(sessionModel ?? '')) ?? 'opus'
    const planLevels = planNow ? layers(planNow.steps) : []
    const doneN = planNow?.steps.filter(s => s.status === 'done' || s.status === 'skip').length ?? 0
    const clarityColor = (n: number) => (n >= 8 ? C.ok : n >= 5 ? C.run : C.bad)
    const skillList = Object.entries(used).sort((a, b) => b[1] - a[1])
    const pad = '       '
    const isOpenQ = (ask: string) => !answered[ask] || answered[ask].state === 'draft'
    // Questions from the prompt check and the plan, the open ones first; the first open one takes the digit hotkeys.
    const questions = [...(checkNow?.questions ?? []), ...(planNow?.questions ?? [])].filter((q, i, all) => all.findIndex(x => x.ask === q.ask) === i)
    const openQ = questions.filter(q => isOpenQ(q.ask))
    const suggested = planNow?.steps.filter(s => s.tier && s.status !== 'done' && s.status !== 'skip' && isOpenQ(delegationAsk(s))) ?? []
    // Where the turn is: understanding (no plan yet), planning (plan, no tool after it), executing, done.
    const execN = turnSteps.filter(s => !s.agentId && s.tools.some(t => t !== 'agent-lens:plan')).length
    const phase = !isBusy && !planNow && turnSteps.length === 0 ? 'idle' : !planNow ? 'understand' : isBusy ? (execN ? 'execute' : 'plan') : 'done'
    // The plan's progress and the step under way, on one line.
    const runningStep = planNow?.steps.find(s => s.status === 'run')
    const total = planNow?.steps.length ?? 0
    const filled = total ? Math.round((doneN / total) * 10) : 0
    const progress = total > 0 && (ui.Svg ? (
      <Box gap={1} alignItems="center">
        <ui.Svg key="flow-bar" source={barSvg(doneN, total, 200, '', { light: '#86efac', mid: '#22c55e', deep: '#16a34a', track: '#ecfdf3' })} alt={`${doneN} of ${total} steps done`} width={200} height={14} />
        <Text wrap="truncate-end">
          <Text dimColor>{doneN}/{total}</Text>
          {runningStep && <Text dimColor> · now </Text>}
          {runningStep && <Text color={C.run}>{runningStep.title}</Text>}
        </Text>
      </Box>
    ) : (
      <Text wrap="truncate-end">
        <Text color={C.ok}>{'▰'.repeat(filled)}</Text>
        <Text dimColor>{'▱'.repeat(10 - filled)} {doneN}/{total}</Text>
        {runningStep && <Text dimColor> · now </Text>}
        {runningStep && <Text color={C.run}>{runningStep.title}</Text>}
      </Text>
    ))

    // A plan step as a checklist row: the level (1a, 1b = same level, run in parallel), the mark, the title.
    // A press on the title opens what it waits for, what runs beside it and the subagent suggestion.
    const planStep = (s: PlanStep, level: PlanStep[], li: number, si: number) => {
      const [mark, markColor] = STATUS_MARK[s.status]
      const num = `${li + 1}${level.length > 1 ? String.fromCharCode(97 + si) : ''}`.padStart(3)
      const key = `p-${s.id}`
      const open = isOpen(key, false)
      const deps = s.after.map(id => planNow?.steps.find(x => x.id === id)?.title ?? id)
      const peers = level.filter(x => x.id !== s.id).map(x => x.title)
      const isSkip = s.status === 'skip'
      const ask = delegationAsk(s)
      const a = s.tier ? answered[ask] : undefined
      const isConfirmed = Boolean(a && a.state !== 'draft')
      const onTier = s.tier ? turnWorkers.filter(w => (tierOf(w.model) ?? 'opus') === s.tier) : []
      const canDelegate = s.tier && !isSkip && s.status !== 'done' && !isConfirmed
      // The session model's own tier is the default: only another model is worth a tag.
      const isOther = s.tier && s.tier !== sessionTier

      return (
        <Box key={`ps-${s.id}`} flexDirection="column">
          <Box>
            <Text dimColor>{num} </Text>
            <Text color={markColor} bold={s.status === 'run'}>{mark} </Text>
            <Button key={`fold-${key}`} plain dimColor={s.status === 'done' || isSkip} label={s.title} onPress={() => toggle(key, !open)} />
            {isOther && (
              <Text color={TIER_COLOR[s.tier!]} wrap="truncate-end">
                {' '}⤷ {s.tier}{isConfirmed ? ' ✓' : onTier.some(w => w.status === 'running') ? ' ●' : canDelegate ? ' ?' : ''}
              </Text>
            )}
          </Box>
          {open && (
            <Box flexDirection="column">
              {deps.length > 0 && <Text wrap="wrap" dimColor>{pad}after: {deps.join(', ')}</Text>}
              {peers.length > 0 && <Text wrap="wrap" dimColor>{pad}in parallel with: {peers.join(', ')}</Text>}
              {deps.length === 0 && peers.length === 0 && !isOther && <Text dimColor>{pad}no dependencies</Text>}
              {isOther && (
                <Text wrap="wrap">
                  <Text dimColor>{pad}</Text>
                  <Text color={TIER_COLOR[s.tier!]}>⤷ a {s.tier} subagent could take this</Text>
                  {s.why !== '' && <Text dimColor> · {s.why}</Text>}
                </Text>
              )}
              {isOther && canDelegate && (
                <Box>
                  <Text dimColor>{pad}</Text>
                  <Button key={`dg-${s.id}`} label={`delegate to ${s.tier}`} onPress={() => void answer($, ask, delegationText(s))} />
                  <Text dimColor> otherwise the model does it itself</Text>
                </Box>
              )}
              {isConfirmed && <Text dimColor>{pad}✓ delegation confirmed{a?.state === 'sent' ? ' · read by the model' : ' · reaches the next step'}</Text>}
              {onTier.map(w => (
                <Text key={`pw-${s.id}-${w.id}`} wrap="truncate-end">
                  <Text dimColor>{pad}⤷ </Text>
                  <Text color={WORKER_COLOR[w.status]}>{w.type}</Text>
                  <Text dimColor> {w.description}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // An executed step on one row: its number, the tools it called (or its answer) and its input tokens. The model
    // shows only when it is not the session's (a subagent, another tier); ▸ opens each tool's input.
    const execStep = (s: Step) => {
      const key = `x-${s.id}`
      const open = isOpen(key, !s.isDone)
      const uses = s.uses ?? []
      const said = (s.answer ?? '').replace(/\s+/g, ' ').trim()
      const gutter = s.agentId ? '         ' : '       '

      return (
        <Box key={s.id} flexDirection="column">
          <Box>
            <Text dimColor>{s.agentId ? '  ⤷' : ''}{`#${s.index}`.padStart(4)} </Text>
            <Button key={`fold-${key}`} plain label={open ? '▾' : '▸'} onPress={() => toggle(key, !open)} />
            <Text wrap="truncate-end">
              {' '}
              {s.agentId && <Text color={C.run}>{workerType(s.agentId)} </Text>}
              {(s.agentId || (tierOf(s.model) ?? 'opus') !== sessionTier) && <Text bold color={modelColor(s.model)}>{short(s.model)} </Text>}
              {!s.isDone ? (
                <Text color={C.run}>● running…</Text>
              ) : s.tools.length ? (
                chips(s.tools)
              ) : s.stop === 'end_turn' ? (
                <Text color={C.ok}>✓ answer </Text>
              ) : (
                <Text dimColor>■ {s.stop ?? '—'} </Text>
              )}
              {s.isDone && <Text dimColor>{k(s.tokensIn)}↑</Text>}
            </Text>
          </Box>
          {open && (
            <Box flexDirection="column">
              {uses.map((u, ui) => {
                const name = toolLabel(u.tool)

                return (
                  <Text key={`xu-${s.id}-${ui}`} wrap="truncate-end">
                    <Text dimColor>{gutter}</Text>
                    <Text color={toolColor(name)}>{toolIcon(name)} {name} </Text>
                    <Text dimColor>{u.brief.replace(/\s+/g, ' ')}</Text>
                  </Text>
                )
              })}
              {said !== '' && (
                <Text wrap="truncate-end">
                  <Text dimColor>{gutter}„</Text>
                  {said}
                </Text>
              )}
              {s.isDone && (
                <Box>
                  <Text dimColor>{gutter}</Text>
                  <Button key={`step-${s.id}`} plain label="[tool outputs]" onPress={() => void openStep($, s)} />
                </Box>
              )}
            </Box>
          )}
        </Box>
      )
    }

    // A question from the plan or the prompt check: numbered options (digits press them on the first open
    // question, ★ = recommended), "0" keeps the model's default, or a typed answer. The answer reaches the model.
    const questionRow = (prefix: string, q: Plan['questions'][number], i: number, isHot: boolean) => {
      const a = answered[q.ask]
      const isAsking = !a || a.state === 'draft'

      return (
        <Box key={`${prefix}-${i}`} flexDirection="column" marginTop={i ? 1 : 0}>
          <Text wrap="wrap">
            <Text color={isAsking ? C.info : C.ok} bold>{isAsking ? '? ' : '✓ '}</Text>
            {q.ask}
          </Text>
          {q.why !== '' && <Text wrap="wrap" dimColor>{'  '}{q.why}</Text>}
          {isAsking ? (
            <Box flexDirection="column" gap={1}>
              <Box gap={1} flexWrap="wrap">
                {q.options.map((o, oi) => (
                  <Button key={`${prefix}-${i}-o-${oi}`} variant={oi === 0 ? 'primary' : 'secondary'} hotkey={isHot ? String(oi + 1) : undefined} label={oi === 0 ? `${o} ★` : o} onPress={() => void answer($, q.ask, o)} />
                ))}
              </Box>
              {q.fallback !== '' && (
                <Button key={`${prefix}-${i}-d`} plain dimColor hotkey={isHot ? '0' : undefined} label={`keep the default: ${q.fallback}`} onPress={() => void answer($, q.ask, q.fallback)} />
              )}
              <Input
                key={`${prefix}-${i}-in`}
                label="  ↳ "
                placeholder={q.options.length ? 'or type another answer' : 'your answer'}
                value={a?.text ?? ''}
                submitLabel="send"
                onInput={v => void update($, answers, all => ({ ...all, [q.ask]: { text: v, state: 'draft' as const } }))}
                onSubmit={v => void answer($, q.ask, v)}
              />
            </Box>
          ) : (
            <Box gap={1}>
              <Text wrap="wrap">
                <Text color={a.state === 'sent' ? C.ok : C.run}>{'  '}↳ {a.text}</Text>
                <Text dimColor>{a.state === 'sent' ? ' · read by the model' : ' · reaches the next step'}</Text>
              </Text>
              <Button key={`${prefix}-${i}-redo`} plain label="[change]" onPress={() => void update($, answers, all => ({ ...all, [q.ask]: { text: a.text, state: 'draft' as const } }))} />
            </Box>
          )}
        </Box>
      )
    }

    // The request as it should have been written, copyable so the next prompt can start from it.
    const copyButton = (key: string, text: string) => (
      <Button key={`${key}-copy`} plain label="[copy]" onPress={(press: { surface?: unknown }) => void copyText($, text, press?.surface)} />
    )
    const betterRow = (key: string, text: string, top: number) => (
      <Box key={key} flexDirection="column" marginTop={top}>
        <Box justifyContent="space-between">
          <Text dimColor>next time, write it like this:</Text>
          {copyButton(key, text)}
        </Box>
        <Text wrap="wrap" italic>„{text}”</Text>
      </Box>
    )

    const answeredQ = questions.filter(q => !isOpenQ(q.ask))
    const otherTiers = planNow?.steps.some(s => s.tier && s.tier !== sessionTier)

    // Flow in three stages, only one open: before you send (how Claude reads the prompt, what to settle, the
    // finished prompt, the model and effort), while it works (progress, what needs you, what Agent Lens did on its
    // own) and when it is done (the summary, next time). A press on a stage shows it; a new prompt follows the turn.
    const autoStage: Stage = heldNow || phase === 'idle' || phase === 'understand' ? 'before' : phase === 'done' ? 'after' : 'during'
    const stageShown = stageNow ?? autoStage
    const STAGES = [
      ['before', ui.Svg ? '1 Before you send' : '1 before'],
      ['during', ui.Svg ? '2 While it works' : '2 working'],
      ['after', ui.Svg ? '3 When it is done' : '3 done'],
    ] as const
    // Three columns, a thin bar over each (dark = the stage shown, green = passed), the name under it.
    const stageOrder = STAGES.findIndex(([id]) => id === autoStage)
    const stageTabs = (
      <Box gap={1}>
        {STAGES.map(([id, name], i) => {
          const isShown = stageShown === id
          const color = isShown ? 'white' : i < stageOrder ? 'green' : 'gray'

          return (
            <Box key={`stage-col-${id}`} flexDirection="column" flexGrow={1}>
              {ui.Svg ? (
                <ui.Svg key={`stage-bar-${id}`} source={`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="4" viewBox="0 0 140 4" preserveAspectRatio="none"><rect width="140" height="4" rx="2" fill="${isShown ? '#e7e5e4' : i < stageOrder ? '#22c55e' : '#57534e'}"/></svg>`} alt="" width={140} height={4} />
              ) : (
                <Text color={color}>{'━'.repeat(14)}</Text>
              )}
              <Button key={`stage-${id}`} plain dimColor={!isShown} label={name} onPress={() => void update($, stageView, () => (id === autoStage ? null : id))} />
            </Box>
          )
        })}
      </Box>
    )
    const label = (text: string) => (
      <Text dimColor size="caption" weight="semibold">
        {text}
      </Text>
    )

    // What needs the person: the open questions first (the first takes the digit hotkeys), then, once there is a
    // plan, the step suggestions to confirm.
    const needsYou = (withDelegations: boolean) => {
      const asks = withDelegations ? suggested : []
      const rule = reflectNow?.state === 'open' && reflectNow.rule ? reflectNow.rule : ''
      if (!openQ.length && !asks.length && !rule) return null

      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.info} paddingX={1}>
          <Text bold color={C.info}>
            NEEDS YOU{' '}
            <Text dimColor>
              {[openQ.length ? `${openQ.length} question${openQ.length > 1 ? 's' : ''}` : '', asks.length ? `${asks.length} delegation${asks.length > 1 ? 's' : ''} to confirm` : '', rule ? '1 rule to save' : ''].filter(Boolean).join(' · ')}
            </Text>
          </Text>
          {openQ.map((q, i) => questionRow('q', q, i, i === 0))}
          {asks.map((s, i) => (
            <Box key={`sg-${s.id}`} marginTop={openQ.length || i ? 1 : 0}>
              <Text wrap="truncate-end">
                <Text color={TIER_COLOR[s.tier ?? 'opus']}>⤷ </Text>
                {s.title}
                <Text dimColor> → {s.tier}{s.why !== '' ? ` · ${s.why}` : ''} </Text>
              </Text>
              <Button key={`sgb-${s.id}`} plain label={`[delegate]`} onPress={() => void answer($, delegationAsk(s), delegationText(s))} />
            </Box>
          ))}
          {rule !== '' && (
            <Box flexDirection="column" marginTop={openQ.length || asks.length ? 1 : 0}>
              <Text wrap="wrap">
                <Text color="magenta" bold>✎ </Text>
                You corrected Claude: <Text italic>„{rule}”</Text>
              </Text>
              <Box gap={1}>
                <Text>{'  '}</Text>
                <Button key="rule-project" plain label="[save to this project]" onPress={() => void saveRule($, 'project')} />
                <Button key="rule-all" plain label="[save everywhere]" onPress={() => void saveRule($, 'all')} />
                <Button key="rule-skip" plain dimColor label="[skip]" onPress={() => void update($, reflect, r => (r ? { ...r, state: 'skipped' as const } : r))} />
              </Box>
            </Box>
          )}
          {(openQ.length > 0 || asks.length > 0) && <Text dimColor>{openQ.length ? '1-4 pick · 0 keeps the default · ' : ''}unanswered = the model goes with its default</Text>}
        </Box>
      )
    }

    // The effort for this message and the model: the pick of the running turn, or for a held prompt what it would be.
    const preview = heldNow ? pickFor(heldNow.text) : null
    const shown = effortNow
      ? { level: effortNow.level, why: effortNow.why, from: effortNow.from, tip: effortNow.tip, isApplied: effortNow.isApplied }
      : preview && effortModeNow !== 'off'
        ? { level: preview.level, why: preview.why, from: undefined, tip: tipFor(preview.level, String(sessionModel ?? ''), sum.steps === 0), isApplied: false }
        : null
    const effortButtons = effortNow && isBusy && (
      <Box gap={1}>
        <Text dimColor>{'      '}</Text>
        <Button key="effort-lower" plain label="[− lower]" onPress={() => void moveEffort($, -1)} />
        <Button key="effort-higher" plain label="[+ higher]" onPress={() => void moveEffort($, 1)} />
      </Box>
    )
    const effortRow = (
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text dimColor>effort </Text>
          {shown ? <Text bold color={C.run}>{shown.level}</Text> : <Text>your level</Text>}
          {shown?.from && shown.from !== shown.level && <Text dimColor> (was {shown.from})</Text>}
          <Text dimColor>{shown ? ` · ${shown.why}${shown.isApplied ? '' : effortModeNow === 'tip' ? ' · tip only' : heldNow ? ' · set when sent' : ''}` : effortModeNow === 'off' ? ' · effort picker off' : ' · nothing in the words moves it'}</Text>
        </Text>
        {effortButtons}
      </Box>
    )
    const tip = shown?.tip
    const finished = checkNow?.better || planNow?.betterPrompt || ''
    const isFinishing = Boolean(heldNow && (!checkNow || checkNow.running))
    const sendRow = heldNow ? (
      <Box gap={1}>
        {finished !== '' && <Button key="send-finished" label="Send the finished prompt" variant="primary" onPress={() => void sendHeld($, finished, true)} />}
        <Button key="send-mine" label="Send mine" variant={finished ? 'secondary' : 'primary'} onPress={() => void sendHeld($, heldNow.text, false)} />
      </Box>
    ) : (
      finished !== '' && (
        <Box gap={1}>
          <Button key="fill-finished" plain label="[put in the prompt box]" onPress={() => void fillPrompt($, finished, 'The finished prompt is in the box.')} />
          {copyButton('fin', finished)}
        </Box>
      )
    )
    const reads = planNow?.clarity ?? (checkNow && !checkNow.running && !checkNow.note ? checkNow.clarity : undefined)

    const beforeView = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {label('YOU WROTE')}
          {lastPrompt !== '' ? <Text wrap="wrap" italic>„{clip(lastPrompt.replace(/\s+/g, ' '), 400)}”</Text> : <Text dimColor>Send a prompt: Agent Lens reads it here first.</Text>}
        </Box>
        {lastPrompt !== '' && (
          <Box flexDirection="column">
            <Box justifyContent="space-between">
              {label('CLAUDE READS IT AS')}
              {reads !== undefined && <Text color={clarityColor(reads)}>clarity {reads}/10</Text>}
            </Box>
            {planNow ? (
              <Text wrap="wrap" weight="semibold">{planNow.goal || '—'}</Text>
            ) : checkNow?.running ? (
              <Text color={C.run}>● haiku is reading your prompt…</Text>
            ) : isBusy ? (
              <Text color={C.run}>● Claude is reading the request…</Text>
            ) : null}
            {(planNow?.assumptions ?? []).map((a, i) => (
              <Text key={`as-${i}`} wrap="wrap" dimColor>
                <Text color={C.run}>~ </Text>
                {a}
              </Text>
            ))}
            {!planNow &&
              (checkNow?.missing ?? []).map((m, i) => (
                <Text key={`cm-${i}`} wrap="wrap">
                  <Text color={C.run}>– </Text>
                  {m}
                </Text>
              ))}
            {checkNow?.note && <Text dimColor wrap="wrap">{checkNow.note}</Text>}
          </Box>
        )}
        {needsYou(false)}
        {(finished !== '' || heldNow) && (
          <Box flexDirection="column" gap={1}>
            <Box justifyContent="space-between">
              {label('FINISHED PROMPT')}
              {finished !== '' && !heldNow && <Button key="fin-edit" plain label="edit" onPress={() => void fillPrompt($, finished, 'The finished prompt is in the box.')} />}
            </Box>
            {finished !== '' ? (
              card({ Box, Text, Button }, 'gray', <Text wrap="wrap" size="footnote">{finished}</Text>)
            ) : isFinishing ? (
              <Text color={C.run}>● haiku is finishing it…</Text>
            ) : (
              <Text color={C.ok}>✓ nothing to add: it can go as it is</Text>
            )}
            {sendRow}
          </Box>
        )}
        {lastPrompt !== '' && (
          <Box flexDirection="column">
            {label('RUN IT WITH')}
            <Box gap={2} flexWrap="wrap">
              <Text color="magenta" size="footnote">
                {short(last?.model ?? String(sessionModel ?? '—'))}
                {tip ? '' : ' ✓ fits'}
              </Text>
              <Text color="yellow" size="footnote">
                effort {shown ? shown.level : 'your level'}
                {shown ? ` · ${shown.why}` : ''}
              </Text>
              {planNow && <Text dimColor size="footnote">~{planNow.steps.length} steps</Text>}
            </Box>
            {tip && (
              <Box gap={1}>
                <Text color={C.info} size="footnote" wrap="truncate-end">⤷ {tip.note}</Text>
                <Button key="model-tip" plain label={tip.command} onPress={() => void fillPrompt($, tip.command, 'Press Enter to switch: it counts from your next message.')} />
              </Box>
            )}
            {shown && !shown.isApplied && <Text dimColor size="footnote">{effortModeNow === 'tip' ? 'tip only' : heldNow ? 'set when sent' : ''}</Text>}
            {effortButtons}
          </Box>
        )}
      </Box>
    )

    const DID_TONE = { ok: C.ok, run: C.run, info: C.info, bad: C.bad } as const
    const didList = (
      <Box flexDirection="column">
        {didNow.length === 0 && <Text dimColor>Nothing yet: what it does on its own shows up here.</Text>}
        {didNow.map((d, i) => (
          <Text key={`did-${i}`} wrap="wrap">
            <Text color={d.tone ? DID_TONE[d.tone] : undefined}>{d.mark} </Text>
            {d.text}
          </Text>
        ))}
      </Box>
    )

    const planSection = () =>
      planNow &&
      section(
        'plan',
        'Plan',
        false,
        () => (
          <Box flexDirection="column">
            {planLevels.map((level, li) => level.map((s, si) => planStep(s, level, li, si)))}
            <Text dimColor wrap="truncate-end">
              press a step for details{planLevels.some(l => l.length > 1) ? ' · 1a, 1b run in parallel' : ''}{otherTiers ? ' · ⤷ a subagent could take it' : ''}
            </Text>
          </Box>
        ),
        <Text color={doneN === planNow.steps.length ? C.ok : undefined} dimColor={doneN < planNow.steps.length}>{doneN}/{planNow.steps.length} done</Text>,
      )
    const execSection = () =>
      section(
        'exec',
        'Execution',
        false,
        () => (
          <Box flexDirection="column">
            {turnSteps.length === 0 && <Text dimColor>No steps yet.</Text>}
            {(skillList.length > 0 || (graphReady && graphN + classicN > 0)) && (
              <Text wrap="truncate-end">
                {graphReady && graphN + classicN > 0 && <Text color={C.graph}>◈ graph {graphN} </Text>}
                {graphReady && graphN + classicN > 0 && <Text dimColor>⌕ search {classicN} </Text>}
                {skillList.length > 0 && <Text color={C.info}>✦ {skillList.map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join(' · ')}</Text>}
              </Text>
            )}
            {turnSteps.length > room && <Text dimColor>… {turnSteps.length - room} earlier steps</Text>}
            {turnSteps.slice(-room).map(execStep)}
          </Box>
        ),
        <Text dimColor>
          {turnSteps.length} steps · {k(tokensIn)}↑ {k(tokensOut)}↓ · cache {tokensIn ? Math.round((cacheRead / tokensIn) * 100) : 0}%
        </Text>,
      )

    const duringView = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column" borderStyle="round" borderColor={isBusy ? C.run : C.ok} paddingX={1}>
          {progress || <Text dimColor>{planNow ? 'No steps in the plan.' : '● Claude is reading the request; its plan lands here.'}</Text>}
          {effortNow?.isApplied && effortRow}
        </Box>
        {needsYou(true)}
        <Box flexDirection="column">
          {label('WHAT AGENT LENS DID')}
          {didList}
        </Box>
        {planSection()}
        {execSection()}
      </Box>
    )

    const afterView = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column" borderStyle="round" borderColor={C.ok} paddingX={1}>
          <Text bold color={C.ok}>✓ done</Text>
          {planNow?.goal && <Text wrap="wrap">{planNow.goal}</Text>}
          <Text wrap="truncate-end" dimColor>
            {turnSteps.length} steps · {usd(turnCost)} · {k(tokensIn)}↑ {k(tokensOut)}↓ · {list.length} file{list.length === 1 ? '' : 's'} changed
          </Text>
          {progress}
        </Box>
        {needsYou(true)}
        {section('did', `What Agent Lens did · ${didNow.length}`, true, () => didList)}
        {planNow &&
          planNow.betterPrompt !== '' &&
          section('better', 'Next time, write it like this', true, () => <Text wrap="wrap" italic>„{planNow.betterPrompt}”</Text>, copyButton('better', planNow.betterPrompt))}
        {planSection()}
        {execSection()}
        {planNow &&
          planNow.savings.length > 0 &&
          section('save', `Savings · ${planNow.savings.length}`, false, () => (
            <Box flexDirection="column">
              {planNow.savings.map((v, i) => (
                <Text key={`sv-${i}`} wrap="wrap">
                  <Text color={C.ok}>⚡ </Text>
                  {v}
                </Text>
              ))}
            </Box>
          ))}
        {answeredQ.length > 0 &&
          section('answered', `Answered · ${answeredQ.length}`, false, () => <Box flexDirection="column">{answeredQ.map((q, i) => questionRow('a', q, i, false))}</Box>)}
        {section('tools', 'Tools in session', false, () => (
          <Text wrap="wrap">
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([name, n]) => `${name} ${n}`)
              .join(' · ') || '—'}
          </Text>
        ))}
      </Box>
    )

    const thinkView = (
      <Box flexDirection="column" gap={1}>
        {stageTabs}
        {stageShown === 'before' ? beforeView : stageShown === 'during' ? duringView : afterView}
      </Box>
    )

    const stagedN = list.filter(c => c.staged).length
    const codeColor = (code: string) => (code === 'M' ? C.run : code === 'A' || code === '?' ? C.ok : code === 'R' ? C.info : C.bad)
    const branch = branchLabel(repoNow.branch)
    // Git: the card says where the branch stands, the list is the changes (press a file for its diff).
    const history = await read($, commits)
    // ponytail: the date as git gives it; a weekday name would need Intl, and the module has no locale
    const dayLabel = (d: string) => d
    const changesView = (
      <Box flexDirection="column" gap={1}>
        {card(
          { Box, Text, Button },
          'green',
          <>
            <Box justifyContent="space-between">
              <Text weight="semibold" color="green" wrap="truncate-end">⑂ {branch.name || '—'}</Text>
              <Text dimColor size="caption">{branch.sync || (list.length ? '' : '✓ nothing to commit')}</Text>
            </Box>
            {!repoNow.loaded && <Text dimColor size="footnote">Reading status…</Text>}
            {repoNow.loaded && !repoNow.top && <Text dimColor size="footnote">Not a git repository.</Text>}
            {repoNow.top !== '' &&
              tiles({ Box, Text, Button }, 'git-tiles', [
                { label: 'changed', value: String(list.length) },
                { label: 'staged', value: String(stagedN), color: stagedN ? C.ok : undefined },
                { label: 'added', value: `+${list.reduce((n, c) => n + c.add, 0)}`, color: C.ok },
                { label: 'removed', value: `-${list.reduce((n, c) => n + c.del, 0)}`, color: C.bad },
              ])}
          </>,
        )}
        {list.length > 0 &&
          section('git-list', 'Changes', true, () => (
            <Box flexDirection="column">
              {list.slice(0, Math.max(4, room - 8)).map(c => {
                const slash = c.path.lastIndexOf('/')

                return (
                  <Box key={`ch-${c.path}`} gap={1} alignItems="center">
                    <Button
                      key={`st-${c.path}`}
                      plain
                      label={c.staged && c.unstaged ? '[~]' : c.staged ? '[x]' : '[ ]'}
                      onPress={() => void gitAct($, top => (c.staged && !c.unstaged ? unstage($, top, [c.path]) : stage($, top, [c.path])))}
                    />
                    <Text mono size="footnote" color={codeColor(c.code)} bold>{c.code}</Text>
                    <Button key={`df-${c.path}`} plain label={c.path.slice(slash + 1)} onPress={() => void openDiff($, c)} />
                    <Box flexGrow={1} flexShrink={1}>
                      <Text mono size="footnote" wrap="truncate-start" dimColor>{slash >= 0 ? c.path.slice(0, slash) : ''}</Text>
                    </Box>
                    {c.code === '?' ? <Text mono size="footnote" color={C.ok}>new</Text> : <Text mono size="footnote" tabular><Text color={C.ok}>+{c.add}</Text> <Text color={C.bad}>-{c.del}</Text></Text>}
                  </Box>
                )
              })}
              {list.length > Math.max(4, room - 8) && <Text mono size="footnote" dimColor>… {list.length - Math.max(4, room - 8)} more (use stage all)</Text>}
            </Box>
          ), <Text dimColor size="caption">{stagedN}/{list.length} staged · press a name for its diff</Text>)}
        {history.length > 0 &&
          section('git-log', 'History', true, () => (
            <Box flexDirection="column" gap={1}>
              {[...new Set(history.map(c => c.date))].map(day => (
                <Box key={`gd-${day}`} flexDirection="column">
                  <Text weight="semibold">{dayLabel(day)}</Text>
                  {history
                    .filter(c => c.date === day)
                    .map(c => (
                      <Box key={`gc-${c.hash}`} flexDirection="column" paddingLeft={2}>
                        <Text wrap="truncate-end">
                          <Text color={/^feat\b/i.test(c.subject) ? C.ok : /^fix\b/i.test(c.subject) ? C.run : undefined}>● </Text>
                          {c.subject}
                        </Text>
                        <Text mono size="footnote" dimColor wrap="truncate-end">
                          {'  '}{c.hash} · {c.time} · {c.files} files · <Text color={C.ok}>+{c.add}</Text> <Text color={C.bad}>-{c.del}</Text>
                        </Text>
                      </Box>
                    ))}
                </Box>
              ))}
            </Box>
          ), <Text dimColor size="caption">last {history.length} on {branch.name || 'this branch'}</Text>)}
      </Box>
    )

    // An opened step of Flow: the answer and each tool (input → output).
    const stepDetail = stepNow && (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>step {stepNow.title}</Text>
          <Button key="step-back" plain label="← flow" hotkey="b" onPress={() => void update($, stepView, () => null)} />
        </Box>
        {stepNow.answer.trim() !== '' && <Text wrap="wrap">{stepNow.answer}</Text>}
        {stepNow.uses.length === 0 && stepNow.answer.trim() === '' && <Text dimColor>The step wrote no text and called no tools.</Text>}
        {stepNow.uses.map((u, i) => (
          <Box key={`su-${i}`} flexDirection="column" marginTop={1}>
            <Text wrap="truncate-end">
              <Text color={C.info} bold>{toolLabel(u.tool)} </Text>
              <Text dimColor>{u.brief}</Text>
            </Text>
            {u.output === undefined ? (
              <Text dimColor>  (no output in the transcript)</Text>
            ) : (
              <Text wrap="wrap" color={u.isError ? C.bad : undefined}>{u.output}</Text>
            )}
          </Box>
        ))}
      </Box>
    )

    const diffView = diffNow && (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold wrap="truncate-start">{diffNow.path}</Text>
          <Button key="diff-back" plain label="← list" hotkey="b" onPress={() => void update($, diff, () => null)} />
        </Box>
        {diffNow.text.trim() ? <Code source={diffNow.text} format="diff" wrap="truncate-end" /> : <Text dimColor>No differences.</Text>}
      </Box>
    )

    // Bottom, under the list: bulk stage/unstage, the message and the commit. Enter in the field = commit.
    const gitControls = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.ok} paddingX={1}>
        <Box gap={1}>
          <Button key="stage-all" label="stage all" hotkey="a" onPress={() => void gitAct($, top => stage($, top, 'all'))} />
          <Button key="unstage-all" label="unstage all" onPress={() => void gitAct($, top => unstage($, top, 'all'))} />
          <Button key="git-refresh" plain label="↻" hotkey="u" onPress={() => void refreshChanges($)} />
          <Button key="sync" label={isSyncing ? 'sync…' : `sync${branch.sync ? ` ${branch.sync}` : ''}`} hotkey="s" onPress={() => void syncRepo($)} />
          <Button key="draft-msg" label={isDrafting ? 'haiku writing…' : 'haiku message'} hotkey="m" onPress={() => void draftMessage($)} />
        </Box>
        <Input
          key="commit-msg"
          label="commit "
          placeholder="commit message"
          value={message}
          submitLabel="commit"
          onInput={v => void update($, commitMsg, () => v)}
          onSubmit={() => void commitStaged($)}
        />
        <Box justifyContent="space-between">
          <Text wrap="truncate-end" color={note ? (note.ok ? C.ok : C.bad) : undefined} dimColor={!note}>
            {note ? `${note.ok ? '✓' : '✗'} ${note.text}` : `${stagedN} files staged`}
          </Text>
          <Button key="commit" variant="primary" label={`commit ${stagedN}`} onPress={() => void commitStaged($)} />
        </Box>
      </Box>
    )

    // Setup's switches: Agent Lens's own, each from the mod it used to be.
    const switchesNow: Switch[] = [
      { key: 'plan', label: 'miniplan before the first tool', on: isPlanFirst, from: 'agent-lens' },
      { key: 'check', label: 'prompt check', on: isChecking, from: 'brain-dump' },
      ...(graphReady ? [{ key: 'graph', label: 'codegraph first', on: isGraphFirst, from: 'agent-lens' }] : []),
      { key: 'hold', label: 'hold long prompts', on: isHolding, from: 'brain-dump' },
      { key: 'effort', label: 'effort per message', on: effortModeNow !== 'off', from: 'effort-picker', value: effortModeNow },
      { key: 'band', label: 'task band above the prompt', on: setupNow.band, from: 'helper-desk' },
      { key: 'cache', label: 'cache clock in the band', on: setupNow.cache, from: 'cache-clock' },
      { key: 'handoff', label: 'handoff offer', on: setupNow.handoff, from: 'handoff' },
      { key: 'reflect', label: 'save corrections as rules', on: setupNow.reflect, from: 'reflect' },
    ]
    const flipSwitch = (key: string) =>
      key === 'plan' ? update($, planFirst, v => !v) : key === 'check' ? flipCheck($) : key === 'graph' ? update($, graphFirst, v => !v) : key === 'hold' ? flipHold($) : key === 'effort' ? flipEffortMode($) : setSetup($, { [key]: !setupNow[key as 'band'] })
    const hookList = await read($, hookRows)
    const hooksSummary = `${hookList.filter(h => h.scope === 'global').length} global · ${hookList.filter(h => h.scope !== 'global').length} project · ${hookList.filter(h => h.isOff).length} off`

    return (
      <Box flexDirection="column" gap={1} minHeight={e.props.scroll.bodyRows}>
        {header}
        {tabs}
        {current === 'think' ? (stepDetail || thinkView) : current === 'agents' ? agentsView(ui, { workers: allWorkers, steps: allSteps, now, fold, short, k, usd }) : current === 'chat' ? chatView(ui, { counts, skills: used, files: await read($, files), edits: await read($, edits), editIdx: await read($, editIdx), plan: planNow, fold }, { step: by => void stepEdit($, by), replay: () => void replayEdits($) }) : current === 'setup' ? setupView(ui, { switches: switchesNow, setup: setupNow, plugins: await read($, plugins), hooks: hooksSummary, style: (await read($, styleActive)) || '—', fold }, { flip: key => void flipSwitch(key), next: key => void nextThreshold($, key), plugin: id => void flipPlugin($, id), hooks: () => { void update($, tab, () => 'hooks' as Tab); void loadHooks($) }, styles: () => { void update($, tab, () => 'styles' as Tab); void loadStyles($) }, command: name => void fillPrompt($, name, 'Press Enter to run it.') }) : current === 'changes' ? (diffView || changesView) : current === 'styles' ? stylesView(
                  $.ui.resolve(e),
                  { list: await read($, styles), active: await read($, styleActive), draft: await read($, styleDraft), fresh: await read($, styleFresh), note: await read($, styleNote), loaded: await read($, styleLoaded), fold },
                  {
                    open: file => void openStyle($, file),
                    back: () => void update($, styleDraft, () => null),
                    use: file => void useStyle($, file),
                    desc: v => editStyle($, d => ({ ...d, description: v })),
                    line: (i, v) => editStyle($, d => ({ ...d, lines: d.lines.map((l, j) => (j === i ? v : l)) })),
                    add: i => editStyle($, d => ({ ...d, lines: [...d.lines.slice(0, i + 1), '', ...d.lines.slice(i + 1)] })),
                    drop: i => editStyle($, d => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((_, j) => j !== i) : [''] })),
                    save: () => void saveStyle($),
                    fresh: v => void update($, styleFresh, () => v),
                    create: name => void createStyle($, name),
                    refresh: () => void loadStyles($),
                  },
                ) : current === 'memories' ? memoriesView(ui, { list: await read($, memories), meta: await read($, memMeta), use: await read($, memUse), opened: await read($, memView), audit: await read($, memAudit), now: await $.clock.now(), fold, graph: await read($, memGraph), draft: await read($, memDraft), explain: await read($, memExplain), width: ui.Svg ? Math.max(300, Math.min(760, Math.round(e.props.bodyColumns * 7.5))) : 0 }, { zoom: by => void update($, memGraph, g => ({ ...g, zoom: by === 0 ? 1 : Math.max(1, Math.min(3, g.zoom + by)) })), filter: type => void update($, memGraph, g => ({ ...g, type })), edit: () => void editMemory($), draft: text => void update($, memDraft, () => text), save: () => void saveMemory($), cancel: () => void update($, memDraft, () => null), explain: name => void explainMemory($, name), analyze: () => void analyzeMemories($), mermaid: (press: { surface?: unknown }) => void copyMermaid($, press?.surface), open: name => void openMemory($, name), back: () => void update($, memView, () => null), refresh: () => void loadMemories($), fix: name => void fixMemory($, name), remove: names => void deleteMemories($, names), unlink: target => void unlinkMemory($, target) }) : current === 'hooks' ? hooksView(
                  $.ui.resolve(e),
                  {
                    rows: await read($, hookRows),
                    draft: await read($, hookDraft),
                    note: await read($, hookNote),
                    loaded: await read($, hooksLoaded),
                    paths: await read($, hookPaths),
                    fold,
                    lens: [
                      { key: 'check', label: 'prompt check', on: isChecking, what: 'haiku reads each prompt at submit' },
                      { key: 'plan', label: 'miniplan', on: isPlanFirst, what: 'a plan in Flow before the first tool' },
                      ...(graphReady ? [{ key: 'graph', label: 'codegraph first', on: isGraphFirst, what: 'codegraph_explore before Grep/Glob' }] : []),
                    ],
                  },
                  {
                    open: row => void openHook($, row),
                    fresh: () => void openHook($, null),
                    back: () => void update($, hookDraft, () => null),
                    toggle: row => void toggleHook($, row),
                    remove: row => void removeHook($, row),
                    edit: patch => void update($, hookDraft, d => (d ? { ...d, ...patch } : d)),
                    save: () => void saveHook($),
                    refresh: () => void loadHooks($),
                    lens: key => void (key === 'check' ? flipCheck($) : key === 'plan' ? update($, planFirst, v => !v) : update($, graphFirst, v => !v)),
                  },
                ) : null}
        <Box flexGrow={1} />
        {current === 'changes' && gitControls}
      </Box>
    )
  })

  // The band above the prompt: the task line (plan progress, cache clock, context), the step under way, then one
  // offer at a time (prompt check, cache going cold, handoff, a rule to save) and the effort of this message.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const conf = await read($, setup)
    if (e.props.hasSurvey || !conf.band || (await read($, bandHidden))) return next(e)
    const planNow = await read($, plan)
    const heldNow = await read($, held)
    const isWorking = e.props.isWorking || (await read($, busy))
    const idle = await read($, idleAt)
    if (!planNow && !heldNow && !isWorking && !idle) return next(e)

    const { Box, Text, Button, ...rest } = $.ui.resolve(e) as ReturnType<typeof $.ui.resolve> & { Svg?: any }
    const Svg = e.surface === 'terminal' ? undefined : rest.Svg
    const now = Math.max(await read($, tick), await $.clock.now())
    const { context } = await $.session.usage()
    const ctx = context.percent ?? 0
    const total = planNow?.steps.length ?? 0
    const doneN = planNow?.steps.filter(s => s.status === 'done' || s.status === 'skip').length ?? 0
    const pct = total ? Math.round((doneN / total) * 100) : 0
    const runStep = planNow?.steps.find(s => s.status === 'run')
    const left = conf.cache && !isWorking ? cacheLeft(idle, now, conf.cacheTtlMin) : null
    const mainSteps = (await read($, steps)).filter(s => !s.agentId)
    const cached = mainSteps.at(-1)?.tokensIn ?? 0
    const said = await read($, prompt)
    const title = clip((planNow?.goal || (said.startsWith('<') ? '' : said) || 'Agent Lens').replace(/\s+/g, ' '), 70)
    const barW = Math.max(120, Math.min(360, Math.round(e.props.bodyColumns * 2.4)))
    const ctxColor = ctx >= conf.handoffAt ? 'red' : ctx >= conf.handoffAt - 20 ? 'yellow' : 'green'
    const cacheColor = left === 0 ? 'red' : left !== null && left <= conf.cacheWarnS * 1000 ? 'yellow' : 'blue'
    // The Bands board's tones as color names, so they follow the app's light or dark theme: a fixed light ground
    // hid the dim text and the buttons on a dark desktop.
    type Tone = 'blue' | 'yellow' | 'orange' | 'magenta' | 'gray' | 'green' | 'red'
    const ink = (tone: Tone) => ({ orange: 'red', gray: 'red' } as Record<string, string>)[tone] ?? tone
    // A chip: on the desktop an outlined pill (cache, ctx), on the terminal colored text.
    const chip = (key: string, tone: Tone, text: string) =>
      Svg ? (
        <Box key={key} borderStyle="round" borderColor={ink(tone)} paddingX={1} flexShrink={0}>
          <Text color={ink(tone)} size="footnote" tabular wrap="truncate-end">{text}</Text>
        </Box>
      ) : (
        <Text key={key} color={ink(tone)} size="footnote" tabular wrap="truncate-end">{text}</Text>
      )

    // Each piece keeps its own line: the title gives way first, the chips never wrap.
    const taskLine = (
      <Box key="band-task" gap={1} alignItems="center">
        <Text color={Svg ? '#6d28d9' : 'magenta'}>●</Text>
        <Box flexShrink={1} minWidth={0}>
          <Text weight="semibold" wrap="truncate-end">{title}</Text>
        </Box>
        {total > 0 && (
          <Box flexShrink={0} gap={1} alignItems="center">
            {Svg ? (
              <Svg key="band-bar" source={barSvg(doneN, total, barW, `Tasks ${doneN}/${total}`)} alt={`Tasks ${doneN} of ${total}, ${pct} percent`} width={barW} height={14} />
            ) : (
              <Text>
                <Text color="magenta">{'▰'.repeat(Math.round(pct / 10))}</Text>
                <Text dimColor>{'▱'.repeat(10 - Math.round(pct / 10))} {doneN}/{total}</Text>
              </Text>
            )}
            <Text dimColor tabular size="footnote">{pct}%</Text>
          </Box>
        )}
        <Box flexGrow={1} />
        <Box flexShrink={0} gap={1} alignItems="center">
          {conf.cache && isWorking && chip('band-cache-chip', 'blue', '◔ cache warm')}
          {conf.cache && !isWorking && left !== null && chip('band-cache-chip', cacheColor, left === 0 ? '◌ cache cold' : `◔ cache ${mmss(left)}`)}
          {conf.cache && !isWorking && left !== null && left > 0 && <Button key="band-warm" plain label="keep warm" onPress={() => void keepWarm($)} />}
          {chip('band-ctx', ctxColor, `ctx ${ctx}%`)}
          <Button key="band-hide" plain dimColor label="✕" onPress={() => void update($, bandHidden, () => true)} />
        </Box>
      </Box>
    )

    // One offer, the first that applies, in a framed row of its color.
    const check = await read($, promptCheck)
    const answered = await read($, answers)
    const openQ = [...(check?.questions ?? []), ...(planNow?.questions ?? [])].filter((q, i, all) => all.findIndex(x => x.ask === q.ask) === i && (answered[q.ask]?.state ?? 'draft') === 'draft')
    const finished = check?.better || planNow?.betterPrompt || ''
    const ref = await read($, reflect)
    const snooze = await read($, handoffSnooze)
    // The border Box holds one inner Box with the row: a bordered Box alone is laid out as a column on the desktop.
    const frame = (key: string, tone: Tone, children: RenderChildren, column = false) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor={ink(tone)} paddingX={1}>
        <Box gap={1} flexDirection={column ? 'column' : 'row'} alignItems={column ? undefined : 'center'}>
          {children}
        </Box>
      </Box>
    )
    const lead = (tone: Tone, text: string) => (
      <Box flexShrink={0}>
        <Text weight="semibold" color={ink(tone)}>{text}</Text>
      </Box>
    )
    const note = (text: string, italic = false) => (
      <Box flexShrink={1} minWidth={0}>
        <Text dimColor={!italic} italic={italic} size="footnote" wrap="truncate-end">{text}</Text>
      </Box>
    )
    const offer = heldNow
      ? frame(
          'band-held',
          'blue',
          <>
            <Box justifyContent="space-between">
              <Text weight="semibold" color={ink('blue')}>Long, loose prompt{openQ.length ? ` · ${openQ.length} gap${openQ.length > 1 ? 's' : ''}` : ''}</Text>
              <Text dimColor size="footnote">{check?.running ? 'haiku is reading it…' : check && !check.note ? `clarity ${check.clarity}/10` : ''}</Text>
            </Box>
            {/* The question whole on its line, its answers as buttons under it (★ = the default). */}
            {openQ.slice(0, 2).map((q, i) => (
              <Box key={`band-q-${i}`} flexDirection="column">
                <Text wrap="wrap">
                  <Text color={ink('blue')} weight="semibold">? </Text>
                  {q.ask}
                </Text>
                <Box gap={1} flexWrap="wrap">
                  {q.options.slice(0, 3).map((o, oi) => (
                    <Button key={`band-q-${i}-${oi}`} variant={oi === 0 ? 'primary' : 'secondary'} label={oi === 0 ? `${o} ★` : o} onPress={() => void answer($, q.ask, o)} />
                  ))}
                </Box>
              </Box>
            ))}
            <Box gap={1}>
              {finished !== '' && <Button key="band-send-finished" label="Send the finished prompt" variant={openQ.length ? 'secondary' : 'primary'} onPress={() => void sendHeld($, finished, true)} />}
              <Button key="band-send-mine" plain label="Send mine as is" onPress={() => void sendHeld($, heldNow.text, false)} />
            </Box>
          </>,
          true,
        )
      : left !== null && left > 0 && left <= conf.cacheWarnS * 1000
          ? frame(
              'band-cache',
              'yellow',
              <>
                {lead('yellow', `◕ Cache cold in ${mmss(left)}`)}
                {note(`${k(cached)} tokens re-read at full price on the next prompt`)}
                <Box flexGrow={1} />
                <Button key="band-warm2" label="Keep warm" variant="primary" onPress={() => void keepWarm($)} />
              </>,
            )
          : conf.handoff && !isWorking && ctx >= Math.max(conf.handoffAt, snooze + 10)
            ? frame(
                'band-handoff',
                'orange',
                <>
                  {lead('orange', `Context ${ctx}%`)}
                  {note('start fresh with a handoff prompt: plan, decisions, open files')}
                  <Box flexGrow={1} />
                  <Button key="band-handoff-go" label="Write handoff" variant="primary" onPress={() => void writeHandoff($)} />
                  <Button key="band-handoff-no" plain dimColor label="Not now" onPress={() => void update($, handoffSnooze, () => ctx)} />
                </>,
              )
            : ref?.state === 'open' && ref.rule
              ? frame(
                  'band-rule',
                  'magenta',
                  <>
                    {lead('magenta', '✎ Save as a rule?')}
                    {note(`„${ref.rule}”`, true)}
                    <Box flexGrow={1} />
                    <Button key="band-rule-a" label="Everywhere" variant="primary" onPress={() => void saveRule($, 'all')} />
                    <Button key="band-rule-p" label="This project" onPress={() => void saveRule($, 'project')} />
                    <Button key="band-rule-x" plain dimColor label="✕" onPress={() => void update($, reflect, r => (r ? { ...r, state: 'skipped' as const } : r))} />
                  </>,
                )
              : null

    const pick = await read($, effortPick)
    const effortLine =
      isWorking &&
      pick &&
      (pick.isApplied || pick.tip) &&
      frame(
        'band-effort',
        'gray',
        <>
          {lead('gray', `Effort ${pick.level}`)}
          {note(`for this message: ${pick.why}`)}
          <Box flexGrow={1} />
          {pick.isApplied && <Button key="band-lower" label="− Lower" onPress={() => void moveEffort($, -1)} />}
          {pick.isApplied && <Button key="band-higher" label="+ Higher" onPress={() => void moveEffort($, 1)} />}
          {pick.tip && <Button key="band-model" label={pick.tip.command} variant="primary" onPress={() => void fillPrompt($, pick.tip!.command, 'Press Enter to switch: it counts from your next message.')} />}
        </>,
      )

    return (
      <Box flexDirection="column">
        {taskLine}
        {runStep && (
          <Box paddingLeft={2}>
            <Text dimColor size="footnote" wrap="truncate-end">Now: {runStep.title}</Text>
          </Box>
        )}
        {offer}
        {effortLine}
      </Box>
    )
  })
}
