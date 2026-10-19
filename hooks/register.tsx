import { atom, read, update } from 'claude-code'
import type { Engine, HookFor, Register, RenderChildren } from 'claude-code'

import type { Answer, Change, Diff, GitNote, HookDraft, HookPaths, HookRow, Memory, MemoryAudit, MemoryMeta, MemoryUse, MemoryView, Miss, Plan, PlanStep, PromptCheck, Repo, Retro, Step, StepView, Style, StyleDraft, Tab, Totals, Validation, Worker } from '../types'
import { branchLabel, cleanMessage, clip, outcomeOf, parseNumstat, parseStatus, syncSteps, withCounts } from './changes'
import { PLAN_DESCRIPTION, PLAN_RULE, PLAN_SCHEMA, PLAN_TOOL, PLAN_TOOL_ID, answersMessage, layers, normalizePlan } from './plan'
import { INDEX, memoriesView } from './memories-tab'
import { stylesView } from './styles-tab'
import { hooksView } from './hooks-tab'
import { checkPrompt, parseCheck, worthChecking } from './check'
import { hasHook, hookFromDraft, mainText, offFile, parseSettings, replaceHook, rowsOf, serialize, withHook, withoutHook } from './settings-hooks'
import type { HookRef, Settings } from './settings-hooks'
import { activeStyle, buildStyle, parseStyle, slugName, withOutputStyle } from './styles'
import { retroMessage, retroOf } from './retro'
import { namesIn, parseIndex, parseMemory, parseVerdicts, projectSlug, toMermaid } from './memories'
import { ESCALATE, ESCALATE_RULE, MODEL_IDS, VALIDATOR, VALIDATOR_PROMPT, addMiss, costOf, escalationOf, learned, tagged, tierOf, verdictOf, wordsOf } from './router'
import type { Tier } from './router'

const PANE = 'agent-lens'

const steps = atom({ plugin: 'agent-lens', key: 'steps' } as const, [])
const workers = atom({ plugin: 'agent-lens', key: 'workers' } as const, [])
const skillsUsed = atom({ plugin: 'agent-lens', key: 'skillsUsed' } as const, {})
const toolCounts = atom({ plugin: 'agent-lens', key: 'toolCounts' } as const, {})
const prompt = atom({ plugin: 'agent-lens', key: 'prompt' } as const, '')
const tab = atom({ plugin: 'agent-lens', key: 'tab' } as const, 'think' as Tab)
// What is open/closed in Flow, by key; a missing key = the row's default state.
const retro = atom({ plugin: 'agent-lens', key: 'retro' } as const, null as Retro | null)
const folds = atom({ plugin: 'agent-lens', key: 'fold' } as const, {} as Record<string, boolean>)
// Routing (delegating down, the learned tier bumps, the retrospective) is off until the person turns it on.
const routing = atom({ plugin: 'agent-lens', key: 'routing' } as const, false)
const edited = atom({ plugin: 'agent-lens', key: 'edited' } as const, [])
const validations = atom({ plugin: 'agent-lens', key: 'validations' } as const, [])
const totals = atom({ plugin: 'agent-lens', key: 'totals' } as const, { steps: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 } as Totals)
const turnTier = atom({ plugin: 'agent-lens', key: 'turnTier' } as const, { tier: 'opus', why: 'default' } as { tier: Tier; why: string })
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
const memType = atom({ plugin: 'agent-lens', key: 'memType' } as const, 'all')
const memAudit = atom({ plugin: 'agent-lens', key: 'memAudit' } as const, { at: 0, running: false, note: '', verdicts: {} } as MemoryAudit)
const styles = atom({ plugin: 'agent-lens', key: 'styles' } as const, [] as Style[])
const styleActive = atom({ plugin: 'agent-lens', key: 'styleActive' } as const, '')
const styleDraft = atom({ plugin: 'agent-lens', key: 'styleDraft' } as const, null as StyleDraft | null)
const styleFresh = atom({ plugin: 'agent-lens', key: 'styleFresh' } as const, '')
const styleNote = atom({ plugin: 'agent-lens', key: 'styleNote' } as const, '')
const styleLoaded = atom({ plugin: 'agent-lens', key: 'styleLoaded' } as const, false)
const plan = atom({ plugin: 'agent-lens', key: 'plan' } as const, null as Plan | null)
const answers = atom({ plugin: 'agent-lens', key: 'answers' } as const, {} as Record<string, Answer>)
const busy = atom({ plugin: 'agent-lens', key: 'busy' } as const, false)
const misses = atom({ plugin: 'agent-lens', key: 'misses' } as const, [] as Miss[])
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

// A turn whose prompt starts with [haiku]/[sonnet]/[opus] runs on that model; any other stays on the session model.
const PINNED = 'picked by you'

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

// Pill with the tier's initial (H/S/O) in the tier's color, so the model of each step reads at a glance.
const pill = (model: string) => (tierOf(model) ?? short(model)).slice(0, 1).toUpperCase()

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

// Learned failures belong to the project and carry over from one session to the next.
const missKey = async ($: Engine) => `misses:${await $.session.root()}`

const recordMiss = async ($: Engine, words: string[] | undefined, tier: Tier | undefined) => {
  if (!words?.length || !tier || tier === 'opus') return
  const list = addMiss(await read($, misses), { words, tier, at: await $.clock.now() })
  await update($, misses, () => list)
  await $.store.set(await missKey($), list)
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
  if (!(await read($, busy))) await submitAnswers($)
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

// After each main-loop turn: the execution analysis (what could have been delegated more cheaply) goes into Flow.
// Only with routing on: off, delegation is not wanted, so neither is advice about it.
const runRetro = async ($: Engine, turnId: string) => {
  if (!(await read($, routing))) return
  const all = await read($, steps)
  const since = await read($, turnAt)
  const turnWorkers = (await read($, workers)).filter(w => w.startedAt >= since && w.agentId)
  const ids = new Set(turnWorkers.map(w => w.agentId))
  const main = all.filter(s => s.turnId === turnId && !s.agentId)
  if (!main.length) return
  const r = retroOf(turnId, await $.clock.now(), main, turnWorkers, all.filter(s => s.agentId && ids.has(s.agentId)), await read($, plan))
  await update($, retro, () => r)
  if (!r.findings.length) return
  $.ui.toast(`Retrospective: ${r.findings.length} possible optimizations${r.saving > 0 ? ` · ~${usd(r.saving)}` : ''}`)
  // The line enters the conversation, like the validator's verdict: the model's next turn reads it.
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: retroMessage(r) }] } })
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

// The "analyze" button: Sonnet reads every memory next to the project's CLAUDE.md and recent commits and says, per
// memory, whether it still helps here. It only marks; nothing is deleted. Kept per project in $.store.
const auditKey = async ($: Engine) => `memaudit:${await $.session.root()}`

const analyzeMemories = async ($: Engine) => {
  const list = await read($, memories)
  const { dir } = await read($, memMeta)
  if (!list.length || (await read($, memAudit)).running) return
  await update($, memAudit, a => ({ ...a, running: true, note: '' }))
  try {
    const root = await $.session.root()
    const now = await $.clock.now()
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const notes: string[] = []
    for (const m of list) notes.push(`### ${m.name} (type ${m.type}, changed ${day(m.mtimeMs)})\n${clip(await $.fs.read(`${dir}/${m.file}`).catch(() => ''), 1500)}`)
    const guide = await $.fs.read(`${root}/CLAUDE.md`).catch(() => '')
    const log = await git($, root, ['log', '-25', '--format=%as %s']).catch(() => ({ stdout: '' }))
    const res = await $.model.complete({
      model: 'sonnet',
      maxTokens: 4000,
      timeoutMs: 120_000,
      prompt: `You audit the persistent memory an AI coding agent keeps for one project. For EACH memory decide:
- relevant: still true and useful when working on this project
- stale: about this project, but done, outdated, contradicted by the guide or the recent commits, or its dates have passed
- irrelevant: not about this project, or of no use to the agent here
Today is ${day(now)}. Project root: ${root}.
Answer ONLY a JSON array, one entry per memory: [{"name": "<exact name>", "verdict": "relevant" | "stale" | "irrelevant", "why": "<at most 14 words, same language as the memories>"}]

Project guide (CLAUDE.md, start):
${clip(guide, 5000) || '(none)'}

Recent commits:
${log.stdout || '(none)'}

Memories:
${notes.join('\n\n')}`,
    })
    const verdicts = res.isAnswered ? parseVerdicts(res.text, list.map(m => m.name)) : {}
    const n = Object.keys(verdicts).length
    if (!n) return void (await update($, memAudit, a => ({ ...a, running: false, note: `✗ Sonnet gave no usable verdict${res.isAnswered ? '' : ` (${res.reason})`}` })))
    await update($, memAudit, () => ({ at: now, running: false, note: n < list.length ? `${list.length - n} memories got no verdict` : '', verdicts }))
    await $.store.set(await auditKey($), { at: now, verdicts })
  } catch (err) {
    await update($, memAudit, a => ({ ...a, running: false, note: `✗ analysis failed: ${(err as Error).message}` }))
  }
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
const flipRouting = async ($: Engine) => {
  const isOn = !(await read($, routing))
  await update($, routing, () => isOn)
  await $.store.set('routing', isOn)
}

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
    await $.agent.register({
      name: 'validator',
      description: 'Final Opus validation of a turn with changes (started only by Agent Lens).',
      prompt: VALIDATOR_PROMPT,
      tools: ['Read', 'Bash'],
      model: 'opus',
    })
    await $.tool.register({ name: PLAN_TOOL, description: PLAN_DESCRIPTION, inputSchema: PLAN_SCHEMA, isDeferred: false })
    void refreshChanges($)
    void loadMemories($)
    void loadStyles($)
    const saved = await $.store.get(await missKey($))
    await update($, misses, () => (Array.isArray(saved) ? (saved as Miss[]) : []))
    // Routing stays off until the person turns it on; the prompt check stays on until they turn it off.
    const prefs = [await $.store.get('routing'), await $.store.get('check')]
    await update($, routing, () => prefs[0] === true)
    await update($, checkOn, () => prefs[1] !== false)
    await update($, hasGraph, () => false)
    if (await $.fs.exists('.codegraph')) await update($, hasGraph, () => true)
    void $.ui.open({ id: PANE, title: 'Agent Lens' })

    return next(e)
  })

  // Only the mod starts the validator, not the main model.
  on('agent.offer', { agent: 'agent-lens:validator' }, () => ({ isOffered: false }))

  on('command.run', { command: 'lens' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agent Lens', focus: true })

    return { text: 'Agent Lens opened.' }
  })

  // A prompt sent by a human counts as "requested": the panel settles at any width,
  // and if it was closed by hand, it comes back. On an already open id it's a no-op.
  on('prompt.submit', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: 'Agent Lens' })
    const tag = tagged(e.text)
    const now = await $.clock.now()
    // A [haiku]/[sonnet]/[opus] tag pins this turn's model; without one the turn runs on the session model.
    await update($, turnTier, () => (tag.tier ? { tier: tag.tier, why: PINNED } : { tier: 'opus', why: 'default' }))
    const isHuman = !e.origin || e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isHuman) {
      await update($, graphSeen, () => false)
      await update($, planAsked, () => false)
      await update($, turnAt, () => now)
      await update($, plan, () => null)
      await update($, answers, () => ({}))
      await update($, folds, () => ({}))
      await update($, retro, () => null)
      await update($, promptCheck, () => null)
    }
    const previous = await read($, prompt)
    await update($, busy, () => true)
    await update($, prompt, () => tag.text)
    await update($, edited, () => [])
    if (isHuman && (await read($, checkOn)) && worthChecking(tag.text)) void runCheck($, tag.text, previous, now)

    return next(tag.tier ? { ...e, text: tag.text } : e)
  })

  // The mod's rules go into the system prompt: downward delegation when routing is on,
  // CodeGraph before Grep/Read when the project has an index.
  on('prompt.compose', async ($, e, next) => {
    const res = await next(e)
    const extra = []
    if (await read($, routing)) {
      extra.push({
        id: 'agent-lens:delegate',
        scope: 'session' as const,
        text: `Whenever you can, delegate to a lower model through Agent with the model parameter: haiku for searches, inventories and code reading; sonnet for mechanical changes with a clear spec (renames, translations, tests following a pattern, precisely described point fixes). Keep on the current model only understanding the problem, design decisions and verifying the result. Don't delegate what you would solve in one or two tool calls. If a subagent replies "${ESCALATE} …", don't retry the task on the same model: take it over yourself or redelegate one tier up.`,
      })
    } else {
      extra.push({
        id: 'agent-lens:no-routing',
        scope: 'session' as const,
        text: "Model routing is off: do the work yourself, on the session model, and don't pass a model to Agent to delegate to haiku or sonnet unless the user's prompt asks for it. In the plan, mark the steps tier opus (= you).",
      })
    }
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

      return { deny: `Publish the miniplan with ${PLAN_TOOL_ID} first: what you understood (goal) and how you will act (approach), with the steps. Then repeat the tool.` }
    }
    // The turn's first classic search, without CodeGraph before it, is denied once; the second goes through.
    if (!e.agentId && /^(Grep|Glob)$/.test(String(e.tool)) && (await read($, hasGraph)) && (await read($, graphFirst)) && !(await read($, graphSeen))) {
      await update($, graphSeen, () => true)

      return { deny: 'The project has a CodeGraph index: start with codegraph_explore (verbatim source and callers in a single call). If it does not cover what you are looking for, repeat Grep/Glob.' }
    }
    const path = (e as { file_path?: string; notebook_path?: string }).file_path ?? (e as { notebook_path?: string }).notebook_path
    if (EDIT_TOOLS.has(String(e.tool)) && path) {
      const running = await read($, validations)
      const isValidator = running.some(v => v.agentId === e.agentId)
      if (!isValidator) await update($, edited, files => (files.includes(path) ? files : [...files, path]))
      // A FAIL verdict on a file edited afterwards is stale, even if the turn (on Opus) doesn't revalidate.
      if (!isValidator) {
        await update($, validations, list =>
          list.map(v => (v.status === 'fail' && v.files.includes(path) ? { ...v, status: 'stale' as const } : v)),
        )
      }
    }
    if (e.agentId) {
      await update($, workers, list =>
        list.map(w => (w.agentId === e.agentId ? { ...w, tools: w.tools + 1 } : w)),
      )
    }

    const res = await next(e)
    if (e.agentId || res.deny !== undefined || res.isError) return res
    const text = await takeAnswers($)

    return text ? { ...res, context: [...(res.context ?? []), text] } : res
  })

  // The main loop stays on the session model unless the prompt pinned one; subagents get their model at spawn.
  on('turn.step', async function* ($, e, next) {
    const pinned = await read($, turnTier)
    if (!e.agentId && pinned.why === PINNED && e.model !== MODEL_IDS[pinned.tier]) e = { ...e, model: MODEL_IDS[pinned.tier] }
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
    const opusCost = usage ? costOf('opus', usage) : 0
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
              opusCost,
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
        opusCost: (t.opusCost ?? 0) + opusCost,
      }))
    }

    return res
  })

  on('agent.spawn', async ($, e, next) => {
    const id = e.tool_use_id || `${e.subagentType}:${await $.clock.now()}`
    const isRoutable = !e.fork && !e.workflow && e.subagentType !== VALIDATOR && (await read($, routing))
    const task = `${e.description} ${e.prompt.slice(0, 200)}`
    const asked = clip(e.prompt, 1500)
    // Opus picks the subagent's model; without one, the subagent inherits Opus.
    const picked = isRoutable && e.model ? { model: e.model, why: 'requested' } : undefined
    // What already failed on this model goes up a tier, even if the main model asked for another.
    const route = picked && (learned(task, tierOf(picked.model) ?? 'opus', await read($, misses)) ?? picked)
    const routeTier = route && tierOf(route.model)
    if (route) e = { ...e, model: route.model, prompt: routeTier && routeTier !== 'opus' ? e.prompt + ESCALATE_RULE : e.prompt }
    const worker: Worker = {
      id,
      type: e.subagentType,
      description: e.description,
      asked: e.model,
      route: route ? `${route.model}: ${route.why}` : e.subagentType === VALIDATOR ? 'opus: final validation' : undefined,
      model: e.model ?? e.parentModel,
      parentModel: e.parentModel,
      isBackground: Boolean(e.background),
      status: 'running',
      startedAt: await $.clock.now(),
      tools: 0,
      words: wordsOf(task),
      prompt: asked,
    }
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
      await runRetro($, e.turnId)
      await update($, busy, () => false)
      await submitAnswers($)
    }
    const pending = (await read($, validations)).find(v => v.agentId === e.agentId)
    if (pending) {
      const verdict = verdictOf(e.answer)
      await update($, validations, list =>
        list.map(v => (v.agentId === pending.agentId ? { ...v, status: verdict.isOk ? ('ok' as const) : ('fail' as const), summary: verdict.line } : v)),
      )
      $.ui.toast(`Opus validation: ${verdict.line}`)
      if (!verdict.isOk) await recordMiss($, pending.words, pending.tier)
      // The line enters the conversation, so the model's next turn reads it.
      await $.session.append({
        message: { type: 'user', content: [{ type: 'text', text: `[Agent Lens · final Opus validation on ${pending.files.join(', ')}]\n${e.answer}` }] },
      })
    }

    const files = await read($, edited)
    const cheaper = (await read($, turnTier)).tier !== 'opus'
    if (!e.agentId && e.reason === 'answer' && files.length > 0 && cheaper && (await read($, routing))) {
      await update($, edited, () => [])
      const request = await read($, prompt)
      const failedTier = (await read($, turnTier)).tier
      const spawned = await $.agent.spawn({
        subagentType: VALIDATOR,
        description: 'Final Opus validation',
        prompt: `User request:\n${request}\n\nModified files:\n${files.join('\n')}`,
      })
      if (spawned.agentId) {
        const validation: Validation = { agentId: spawned.agentId, files, status: 'running', summary: '', words: wordsOf(request), tier: failedTier }
        await update($, validations, list => [...list, validation].slice(-10))
      }
    }

    if (e.agentId) {
      const escalated = escalationOf(e.answer ?? '')
      const worker = (await read($, workers)).find(w => w.agentId === e.agentId)
      if (escalated && worker) {
        $.ui.toast(`${worker.type} on ${short(worker.model)} asks for a higher model: ${escalated}`)
        await recordMiss($, worker.words, tierOf(worker.model))
      }
      await update($, workers, list =>
        list.map(w =>
          w.agentId === e.agentId
            ? {
                ...w,
                escalated,
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
    const isRouting = await read($, routing)
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
    const tierNow = await read($, turnTier)
    const graphReady = await read($, hasGraph)
    const isGraphFirst = await read($, graphFirst)
    const lastCheck = (await read($, validations)).at(-1)
    const allSteps = await read($, steps)
    const allWorkers = await read($, workers)
    const used = await read($, skillsUsed)
    const counts = await read($, toolCounts)
    const lastPrompt = await read($, prompt)
    // A tab saved by an older version (Steps, Skills) falls back to Flow.
    const stored = String(await read($, tab))
    const current: Tab = ['think', 'changes', 'memories', 'styles', 'hooks'].includes(stored) ? (stored as Tab) : 'think'
    const foldNow = await read($, folds)
    const retroNow = await read($, retro)
    const sessionModel = await $.session.model()
    const sum = await read($, totals)
    const learnedNow = await read($, misses)
    const isPlanFirst = await read($, planFirst)
    const isChecking = await read($, checkOn)
    const checkNow = await read($, promptCheck)
    const since = await read($, turnAt)
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
    const saved = sum.opusCost ? Math.round((1 - (sum.cost ?? 0) / sum.opusCost) * 100) : 0
    const running = allWorkers.filter(w => w.status === 'running').length
    const workerType = (agentId: string) => allWorkers.find(w => w.agentId === agentId)?.type ?? 'worker'

    const header = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.accent} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color={C.accent}>◆ AGENT LENS</Text>
          <Box gap={1}>
            <Text color={running ? C.run : C.ok}>{running ? `● ${running} worker${running > 1 ? 's' : ''}` : '○ idle'}</Text>
            {/* Output styles: a small icon, not a tab; pressed again it goes back to Flow. */}
            <Button
              key="tab-styles"
              plain
              label={current === 'styles' ? '[Aa]' : 'Aa'}
              hotkey="y"
              onPress={() => {
                void update($, tab, () => (current === 'styles' ? 'think' : 'styles'))
                if (current !== 'styles') void loadStyles($)
              }}
            />
          </Box>
        </Box>
        <Text>
          <Text dimColor>model </Text>
          <Text bold color={C.model}>{short(last?.model ?? String(sessionModel ?? '—'))}</Text>
          {last?.effort && <Text dimColor> · effort </Text>}
          {last?.effort && <Text color={C.info}>{last.effort}</Text>}
        </Text>
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>routing </Text>
            {isRouting ? <Text color={C.accent}>auto: delegates down</Text> : <Text dimColor>off</Text>}
            {tierNow.why === PINNED ? (
              <Text>
                <Text dimColor> · this turn </Text>
                <Text bold color={TIER_COLOR[tierNow.tier]}>{tierNow.tier}</Text>
              </Text>
            ) : (
              <Text dimColor> · [haiku]/[sonnet] at the start pins a turn</Text>
            )}
          </Text>
          <Button key="routing" plain label={isRouting ? '[off]' : '[on]'} hotkey="r" onPress={() => void flipRouting($)} />
        </Box>
        {graphReady && (
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text dimColor>codegraph </Text>
              {isGraphFirst ? <Text color={C.graph}>first, before Grep/Glob</Text> : <Text dimColor>free</Text>}
            </Text>
            <Button key="graph" plain label={isGraphFirst ? '[off]' : '[on]'} hotkey="g" onPress={() => update($, graphFirst, v => !v)} />
          </Box>
        )}
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>miniplan </Text>
            {isPlanFirst ? <Text color={C.accent}>first in Flow: what I understand, how I act</Text> : <Text dimColor>off</Text>}
          </Text>
          <Button key="planfirst" plain label={isPlanFirst ? '[off]' : '[on]'} hotkey="n" onPress={() => update($, planFirst, v => !v)} />
        </Box>
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>prompt check </Text>
            {isChecking ? <Text color={C.accent}>haiku at submit: gaps + questions</Text> : <Text dimColor>off</Text>}
          </Text>
          <Button key="check" plain label={isChecking ? '[off]' : '[on]'} hotkey="k" onPress={() => void flipCheck($)} />
        </Box>
        {lastCheck && (
          <Text wrap="truncate-end" dimColor={lastCheck.status === 'stale'} color={lastCheck.status === 'ok' ? C.ok : lastCheck.status === 'fail' ? C.bad : lastCheck.status === 'running' ? C.run : undefined}>
            {lastCheck.status === 'running'
              ? '● opus validation running…'
              : lastCheck.status === 'stale'
                ? '↻ stale verdict: files changed afterwards'
                : `${lastCheck.status === 'ok' ? '✓' : '✗'} ${lastCheck.summary}`}
          </Text>
        )}
        <Text dimColor>
          turn: {turnSteps.length} steps · {k(tokensIn)}↑ {k(tokensOut)}↓ · cache {tokensIn ? Math.round((cacheRead / tokensIn) * 100) : 0}%
        </Text>
        {/* API list prices: on a subscription this measures savings, not the bill. */}
        <Text wrap="truncate-end">
          <Text dimColor>turn cost </Text>
          <Text>{usd(turnCost)}</Text>
          <Text dimColor> · session </Text>
          <Text>{usd(sum.cost ?? 0)}</Text>
          <Text dimColor> / all on opus {usd(sum.opusCost ?? 0)} </Text>
          <Text color={saved > 0 ? C.ok : undefined}>({saved > 0 ? `−${saved}` : '0'}%)</Text>
        </Text>
        {isRouting && learnedNow.length > 0 && (
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text dimColor>learned </Text>
              <Text color={C.run}>{learnedNow.length} failures</Text>
              <Text dimColor> on cheap models · similar tasks go up a tier</Text>
            </Text>
            <Button key="forget" plain label="[forget]" onPress={async () => { await update($, misses, () => []); await $.store.delete(await missKey($)) }} />
          </Box>
        )}
        {/* From /usage: the account's context and 5h / 7-day limits. */}
        <Box gap={2}>
          <Text wrap="truncate-end">
            <Text dimColor>context </Text>
            <Text color={pctColor(context.percent ?? 0, 85)}>{context.percent ?? '—'}%</Text>
            <Text dimColor> {k(context.tokens ?? 0)}/{k(context.window)}</Text>
          </Text>
          {rateLimits.filter(r => r.kind === 'five_hour' || r.kind === 'seven_day').map(r => (
            <Text key={`rl-${r.kind}`} wrap="truncate-end">
              <Text dimColor>{WINDOWS[r.kind]} </Text>
              <Text color={pctColor(r.percentUsed, 90)}>{r.percentUsed}%</Text>
              {r.resetsAt && <Text dimColor> · {until(Date.parse(r.resetsAt) - now)}</Text>}
            </Text>
          ))}
        </Box>
      </Box>
    )

    const tabs = (
      <Box gap={1}>
        {(
          [
            ['think', 'Flow', 'f'],
            ['changes', `Git ${list.length}`, 'c'],
            ['memories', 'Memories', 'e'],
            ['hooks', 'Hooks', 'h'],
          ] as [Tab, string, string][]
        ).map(([id, label, hotkey]) => (
          <Button
            key={`tab-${id}`}
            label={label}
            hotkey={hotkey}
            variant={current === id ? 'primary' : 'secondary'}
            onPress={() => {
              void update($, tab, () => id)
              if (id === 'changes') void refreshChanges($)
              if (id === 'memories') void loadMemories($)
              if (id === 'hooks') void loadHooks($)
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
    const maxIn = Math.max(1, ...turnSteps.map(s => s.tokensIn))
    const turnWorkers = allWorkers.filter(w => w.startedAt >= since)

    // Everything foldable: sections, plan steps, execution steps. A missing key = the default state.
    const isOpen = (key: string, byDefault: boolean) => foldNow[key] ?? byDefault
    const toggle = (key: string, open: boolean) => void update($, folds, f => ({ ...f, [key]: open }))
    const section = (key: string, title: string, byDefault: boolean, body: () => RenderChildren, aside?: RenderChildren) => {
      const open = isOpen(key, byDefault)

      return (
        <Box key={`sec-${key}`} flexDirection="column">
          <Box justifyContent="space-between">
            <Button key={`fold-${key}`} plain label={`${open ? '▾' : '▸'} ${title}`} onPress={() => toggle(key, !open)} />
            {aside}
          </Box>
          {open && body()}
        </Box>
      )
    }

    // The Flow tab: how the model understood the request, the plan by level (steps on the same level
    // run in parallel: ┬ ├ └) and what was actually executed, step by step, each with its model.
    const TIER_ICON = { haiku: '⌕', sonnet: '✎', opus: '◆' } as const
    const TIER_JOB = { haiku: 'searches, reads, inventories', sonnet: 'mechanical changes with a clear spec', opus: 'me: understanding, decisions, verification' } as const
    const STATUS_MARK = { todo: ['○', undefined], run: ['●', C.run], done: ['✓', C.ok], skip: ['⊘', undefined] } as const
    const WORKER_COLOR = { running: C.run, done: C.ok, aborted: C.bad, denied: C.bad } as const
    const planLevels = planNow ? layers(planNow.steps) : []
    const mix = planNow ? (['haiku', 'sonnet', 'opus'] as const).map(t => [t, planNow.steps.filter(s => s.tier === t).length] as const) : []
    const doneN = planNow?.steps.filter(s => s.status === 'done' || s.status === 'skip').length ?? 0
    const clarityColor = (n: number) => (n >= 8 ? C.ok : n >= 5 ? C.run : C.bad)
    const skillList = Object.entries(used).sort((a, b) => b[1] - a[1])
    const pad = '       '

    const planStep = (s: PlanStep, level: PlanStep[], li: number, si: number) => {
      const [mark, markColor] = STATUS_MARK[s.status]
      const branch = level.length === 1 ? '──' : si === 0 ? '┬─' : si === level.length - 1 ? '└─' : '├─'
      const key = `p-${s.id}`
      const open = isOpen(key, s.status === 'run')
      const deps = s.after.map(id => planNow?.steps.find(x => x.id === id)?.title ?? id)
      const peers = level.filter(x => x.id !== s.id).map(x => x.title)
      const onTier = turnWorkers.filter(w => (tierOf(w.model) ?? 'opus') === s.tier)

      return (
        <Box key={`ps-${s.id}`} flexDirection="column">
          <Box>
            <Text dimColor>{si === 0 ? `${String(li + 1).padStart(2)} ` : '   '}{branch} </Text>
            <Button key={`fold-${key}`} plain label={open ? '▾' : '▸'} onPress={() => toggle(key, !open)} />
            <Text wrap="truncate-end" dimColor={s.status === 'skip'}>
              <Text color={markColor}> {mark} </Text>
              <Text color={TIER_COLOR[s.tier]} bold={s.tier === 'opus'}>{TIER_ICON[s.tier]} {s.tier} </Text>
              <Text strikethrough={s.status === 'skip'}>{s.title}</Text>
            </Text>
          </Box>
          {open && (
            <Box flexDirection="column">
              <Text wrap="wrap">
                <Text dimColor>{pad}model </Text>
                <Text bold color={TIER_COLOR[s.tier]}>{s.tier}</Text>
                <Text dimColor> · {TIER_JOB[s.tier]}</Text>
              </Text>
              {deps.length > 0 && <Text wrap="wrap" dimColor>{pad}after: {deps.join(', ')}</Text>}
              {peers.length > 0 && <Text wrap="wrap" dimColor>{pad}in parallel with: {peers.join(', ')}</Text>}
              {s.tier !== 'opus' && onTier.length === 0 && <Text dimColor>{pad}no {s.tier} subagent started yet</Text>}
              {s.tier !== 'opus' &&
                onTier.map(w => (
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

    const execStep = (s: Step, i: number, all: Step[]) => {
      const isLast = i === all.length - 1
      const branch = s.agentId ? '│ ⤷' : isLast ? '└─' : '├─'
      const gutter = s.agentId || !isLast ? '│      ' : '       '
      const cells = Math.max(1, Math.round((s.tokensIn / maxIn) * 8))
      const key = `x-${s.id}`
      const open = isOpen(key, !s.isDone)
      const uses = s.uses ?? []
      const said = (s.answer ?? '').replace(/\s+/g, ' ').trim()

      return (
        <Box key={s.id} flexDirection="column">
          <Box>
            <Text dimColor>{branch} </Text>
            <Button key={`fold-${key}`} plain label={open ? '▾' : '▸'} onPress={() => toggle(key, !open)} />
            <Text>
              {' '}
              {s.agentId && <Text color={C.run}>{workerType(s.agentId)} </Text>}
              <Text bold inverse color={modelColor(s.model)}> {pill(s.model)} </Text>
              <Text bold color={modelColor(s.model)}> {short(s.model)}</Text>
              {s.effort && <Text color={C.info}> {s.effort}</Text>}
              <Text dimColor> #{s.index} </Text>
            </Text>
            <Text wrap="truncate-end">
              {s.isDone ? (
                <Text>
                  <Text color={modelColor(s.model)}>{'▮'.repeat(cells)}</Text>
                  <Text dimColor>{'▯'.repeat(8 - cells)} {k(s.tokensIn)}↑ {k(s.tokensOut)}↓</Text>
                </Text>
              ) : (
                <Text color={C.run}>● running…</Text>
              )}
            </Text>
          </Box>
          {s.isDone && !open && (
            <Text wrap="truncate-end">
              <Text dimColor>{gutter}</Text>
              {s.tools.length ? chips(s.tools) : s.stop === 'end_turn' ? <Text color={C.ok}>✓ answer</Text> : <Text dimColor>■ {s.stop ?? '—'}</Text>}
            </Text>
          )}
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

    // A question from the plan or the prompt check: one-click options or a typed answer, which reaches the model.
    const questionRow = (prefix: string, q: Plan['questions'][number], i: number) => {
      const a = answered[q.ask]
      const isAsking = !a || a.state === 'draft'

      return (
        <Box key={`${prefix}-${i}`} flexDirection="column" marginTop={i ? 1 : 0}>
          <Text wrap="wrap">
            <Text color={isAsking ? C.info : C.ok}>{isAsking ? '? ' : '✓ '}</Text>
            {q.ask}
          </Text>
          {q.why !== '' && <Text wrap="wrap" dimColor>{'  '}→ {q.why}</Text>}
          {isAsking ? (
            <Box flexDirection="column">
              {q.fallback !== '' && <Text wrap="wrap" dimColor>{'  '}default: {q.fallback}</Text>}
              {q.options.length > 0 && (
                <Box gap={1} flexWrap="wrap">
                  {q.options.map((o, oi) => (
                    <Button key={`${prefix}-${i}-o-${oi}`} plain={oi > 0 || undefined} label={o} onPress={() => void answer($, q.ask, o)} />
                  ))}
                </Box>
              )}
              <Input
                key={`${prefix}-${i}-in`}
                label="  ↳ "
                placeholder={q.options.length ? 'or write something else' : 'your answer'}
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
                <Text dimColor>{a.state === 'sent' ? ' · read' : ' · reaches the next step'}</Text>
              </Text>
              {a.state === 'sent' && <Button key={`${prefix}-${i}-redo`} plain label="change" onPress={() => void update($, answers, all => ({ ...all, [q.ask]: { text: a.text, state: 'draft' as const } }))} />}
            </Box>
          )}
        </Box>
      )
    }

    // The request as it should have been written, copyable so the next prompt can start from it.
    const betterRow = (key: string, text: string, top: number) => (
      <Box key={key} flexDirection="column" marginTop={top}>
        <Box justifyContent="space-between">
          <Text dimColor>next time, write it like this:</Text>
          <Button key={`${key}-copy`} plain label="[copy]" onPress={(press: { surface?: unknown }) => void copyText($, text, press?.surface)} />
        </Box>
        <Text wrap="wrap" italic>„{text}”</Text>
      </Box>
    )

    const thinkView = (
      <Box flexDirection="column" gap={1}>
        {lastPrompt !== '' && (
          <Text wrap="truncate-end">
            <Text color={C.accent}>▸ </Text>
            <Text italic>{lastPrompt.replace(/\s+/g, ' ')}</Text>
          </Text>
        )}
        {checkNow &&
          section('check', `PROMPT CHECK${checkNow.running ? ' …' : checkNow.note ? ' ✗' : ` ${checkNow.clarity}/10`}`, true, () => (
            <Box flexDirection="column">
              {checkNow.running && <Text color={C.run}>● haiku is reading your prompt…</Text>}
              {checkNow.note !== '' && <Text wrap="wrap" dimColor>{checkNow.note}</Text>}
              {!checkNow.running && checkNow.note === '' && (
                <Box flexDirection="column">
                  <Text>
                    <Text dimColor>clarity </Text>
                    <Text color={clarityColor(checkNow.clarity)}>{'▮'.repeat(checkNow.clarity)}</Text>
                    <Text dimColor>{'▯'.repeat(10 - checkNow.clarity)} {checkNow.clarity}/10 · from the prompt alone</Text>
                  </Text>
                  {checkNow.missing.length === 0 && checkNow.questions.length === 0 && <Text color={C.ok}>✓ nothing important missing</Text>}
                  {checkNow.missing.map((m, i) => (
                    <Text key={`cm-${i}`} wrap="wrap">
                      <Text color={C.run}>– </Text>
                      {m}
                    </Text>
                  ))}
                  {checkNow.questions.length > 0 && <Box flexDirection="column" marginTop={1}>{checkNow.questions.map((q, i) => questionRow('cq', q, i))}</Box>}
                  {checkNow.better !== '' && betterRow('cbetter', checkNow.better, 1)}
                </Box>
              )}
            </Box>
          ))}
        {!planNow && <Text dimColor>No plan yet for this request.</Text>}
        {planNow &&
          section('goal', 'UNDERSTAND', true, () => (
            <Box flexDirection="column">
              <Text wrap="wrap">
                <Text color={C.accent}>▸ </Text>
                {planNow.goal || '—'}
              </Text>
              <Text>
                <Text dimColor>clarity </Text>
                <Text color={clarityColor(planNow.clarity)}>{'▮'.repeat(planNow.clarity)}</Text>
                <Text dimColor>{'▯'.repeat(10 - planNow.clarity)} {planNow.clarity}/10</Text>
                {planNow.revision > 0 && <Text dimColor> · rev {planNow.revision}</Text>}
              </Text>
              {(planNow.approach ?? '') !== '' && (
                <Text wrap="wrap">
                  <Text color={C.info}>→ </Text>
                  {planNow.approach}
                </Text>
              )}
            </Box>
          ))}
        {planNow &&
          planNow.assumptions.length > 0 &&
          section('assume', `ASSUMPTIONS ${planNow.assumptions.length}`, false, () => (
            <Box flexDirection="column">
              {planNow.assumptions.map((a, i) => (
                <Text key={`as-${i}`} wrap="wrap">
                  <Text color={C.run}>~ </Text>
                  {a}
                </Text>
              ))}
            </Box>
          ))}
        {planNow &&
          section(
            'plan',
            `PLAN ${doneN}/${planNow.steps.length}`,
            true,
            () => (
              <Box flexDirection="column">
                {planLevels.map((level, li) => (
                  <Box key={`lv-${li}`} flexDirection="column">
                    {level.map((s, si) => planStep(s, level, li, si))}
                    {li < planLevels.length - 1 && <Text dimColor>{'   │'}</Text>}
                  </Box>
                ))}
              </Box>
            ),
            <Text>
              {mix.filter(([, n]) => n > 0).map(([t, n]) => (
                <Text key={`mix-${t}`} color={TIER_COLOR[t]} bold={t === 'opus'}>
                  {TIER_ICON[t]}{n}{' '}
                </Text>
              ))}
            </Text>,
          )}
        {section(
          'exec',
          `EXECUTION ${turnSteps.length} steps`,
          true,
          () => (
            <Box flexDirection="column">
              {turnSteps.length === 0 && <Text dimColor>No steps yet. Send a prompt.</Text>}
              {turnSteps.length > 0 && (
                <Text wrap="truncate-end">
                  <Text dimColor>path </Text>
                  {turnSteps.slice(-30).map(s => (
                    <Text key={`m-${s.id}`} color={s.isDone ? modelColor(s.model) : C.run}>
                      {s.agentId ? (s.isDone ? '◆' : '◇') : s.isDone ? '■' : '▪'}
                    </Text>
                  ))}
                </Text>
              )}
              {graphReady && turnSteps.length > 0 && (
                <Text wrap="truncate-end">
                  <Text dimColor>graph </Text>
                  <Text color={C.graph}>{'▮'.repeat(graphCells)}</Text>
                  <Text dimColor>{'▯'.repeat(10 - graphCells)}</Text>
                  <Text dimColor> ◈{graphN} · ⌕{classicN}</Text>
                </Text>
              )}
              {skillList.length > 0 && (
                <Text wrap="truncate-end">
                  <Text dimColor>skills </Text>
                  <Text color={C.info}>✦ {skillList.map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join(' · ')}</Text>
                </Text>
              )}
              {turnSteps.slice(-room).map(execStep)}
            </Box>
          ),
          <Text dimColor>{k(tokensIn)}↑ {k(tokensOut)}↓</Text>,
        )}
        {retroNow &&
          section(
            'retro',
            `RETROSPECTIVE ${retroNow.findings.length ? `${retroNow.findings.length} to optimize` : 'ok'}`,
            true,
            () => (
              <Box flexDirection="column">
                <Text wrap="truncate-end" dimColor>
                  {retroNow.steps} steps · {usd(retroNow.cost)} · {Math.round(retroNow.cheapShare * 100)}% of cost on haiku/sonnet
                </Text>
                {retroNow.findings.length === 0 && <Text color={C.ok}>✓ delegation was right for this turn</Text>}
                {retroNow.findings.map((f, i) => (
                  <Text key={`rf-${i}`} wrap="wrap">
                    <Text color={f.kind === 'escalated' ? C.bad : C.run}>{f.kind === 'escalated' ? '⇡ ' : f.kind === 'plan' ? '≠ ' : '↓ '}</Text>
                    {f.text}
                    {f.saving > 0 && <Text color={C.ok}> · ~{usd(f.saving)}</Text>}
                    {(f.wasted ?? 0) > 0 && <Text color={C.bad}> · wasted {usd(f.wasted ?? 0)}</Text>}
                  </Text>
                ))}
                {retroNow.saving > 0 && (
                  <Text wrap="truncate-end">
                    <Text dimColor>possible savings </Text>
                    <Text color={C.ok}>~{usd(retroNow.saving)}</Text>
                    <Text dimColor> ({Math.round((retroNow.saving / Math.max(retroNow.cost, 1e-9)) * 100)}% of the turn, estimate)</Text>
                  </Text>
                )}
              </Box>
            ),
          )}
        {planNow &&
          planNow.savings.length > 0 &&
          section('save', `SAVINGS ${planNow.savings.length}`, false, () => (
            <Box flexDirection="column">
              {planNow.savings.map((v, i) => (
                <Text key={`sv-${i}`} wrap="wrap">
                  <Text color={C.ok}>⚡ </Text>
                  {v}
                </Text>
              ))}
            </Box>
          ))}
        {planNow && (planNow.questions.length > 0 || planNow.betterPrompt) && (
          <Box flexDirection="column" borderStyle="round" borderColor={C.info} paddingX={1}>
            <Text bold color={C.info}>HOW YOU CAN HELP ME BE PRECISE</Text>
            {planNow.questions.map((q, i) => questionRow('q', q, i))}
            {planNow.betterPrompt !== '' && betterRow('better', planNow.betterPrompt, planNow.questions.length ? 1 : 0)}
          </Box>
        )}
        {section('tools', 'TOOLS IN SESSION', false, () => (
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

    const stagedN = list.filter(c => c.staged).length
    const codeColor = (code: string) => (code === 'M' ? C.run : code === 'A' || code === '?' ? C.ok : code === 'R' ? C.info : C.bad)
    const branch = branchLabel(repoNow.branch)
    const changesView = (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color={C.info}>⑂ {branch.name || '—'}</Text>
            {branch.sync && <Text color={C.run}> {branch.sync}</Text>}
          </Text>
          <Text dimColor>{stagedN} staged · {list.length} total</Text>
        </Box>
        {!repoNow.loaded && <Text dimColor>Reading status…</Text>}
        {repoNow.loaded && !repoNow.top && <Text dimColor>Not a git repository.</Text>}
        {repoNow.top && list.length === 0 && <Text color={C.ok}>✓ nothing to commit</Text>}
        {list.slice(0, Math.max(4, room - 8)).map(c => {
          const slash = c.path.lastIndexOf('/')

          return (
            <Box key={`ch-${c.path}`} gap={1}>
              <Button
                key={`st-${c.path}`}
                plain
                label={c.staged && c.unstaged ? '[~]' : c.staged ? '[x]' : '[ ]'}
                onPress={() => void gitAct($, top => (c.staged && !c.unstaged ? unstage($, top, [c.path]) : stage($, top, [c.path])))}
              />
              <Text color={codeColor(c.code)} bold>{c.code}</Text>
              <Text wrap="truncate-start" dimColor>{slash >= 0 ? c.path.slice(0, slash + 1) : ''}</Text>
              <Button key={`df-${c.path}`} plain label={c.path.slice(slash + 1)} onPress={() => void openDiff($, c)} />
              {c.code === '?' ? <Text color={C.ok}>new</Text> : <Text><Text color={C.ok}>+{c.add}</Text> <Text color={C.bad}>-{c.del}</Text></Text>}
            </Box>
          )
        })}
        {list.length > Math.max(4, room - 8) && <Text dimColor>… +{list.length - Math.max(4, room - 8)} files (use [stage all])</Text>}
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

    return (
      <Box flexDirection="column" gap={1} minHeight={e.props.scroll.bodyRows}>
        {header}
        {tabs}
        {current === 'think' ? (stepDetail || thinkView) : current === 'changes' ? (diffView || changesView) : current === 'styles' ? stylesView(
                  $.ui.resolve(e),
                  { list: await read($, styles), active: await read($, styleActive), draft: await read($, styleDraft), fresh: await read($, styleFresh), note: await read($, styleNote), loaded: await read($, styleLoaded) },
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
                ) : current === 'memories' ? memoriesView($.ui.resolve(e), { list: await read($, memories), meta: await read($, memMeta), use: await read($, memUse), opened: await read($, memView), filter: await read($, memType), audit: await read($, memAudit), now: await $.clock.now() }, { analyze: () => void analyzeMemories($), mermaid: (press: { surface?: unknown }) => void copyMermaid($, press?.surface), open: name => void openMemory($, name), back: () => void update($, memView, () => null), filter: t => void update($, memType, () => t), refresh: () => void loadMemories($) }) : current === 'hooks' ? hooksView(
                  $.ui.resolve(e),
                  {
                    rows: await read($, hookRows),
                    draft: await read($, hookDraft),
                    note: await read($, hookNote),
                    loaded: await read($, hooksLoaded),
                    paths: await read($, hookPaths),
                    lens: [
                      { key: 'check', label: 'prompt check', on: isChecking, what: 'haiku reads each prompt at submit' },
                      { key: 'plan', label: 'miniplan', on: isPlanFirst, what: 'a plan in Flow before the first tool' },
                      { key: 'routing', label: 'routing', on: isRouting, what: 'auto delegation; off = only [haiku]/[sonnet] tags' },
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
                    lens: key => void (key === 'check' ? flipCheck($) : key === 'routing' ? flipRouting($) : key === 'plan' ? update($, planFirst, v => !v) : update($, graphFirst, v => !v)),
                  },
                ) : null}
        <Box flexGrow={1} />
        {current === 'changes' && gitControls}
      </Box>
    )
  })
}
