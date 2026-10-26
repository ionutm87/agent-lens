# Agent Lens

A Claude Code sidebar (a mod: a hooks module drawn as a pane). Per turn it shows how the model understood
the request and how it split it (the Flow tab, published through the `plan` tool), the execution step by
step with each step's model, tokens and cost, and the subagent workers. Around it:

- **Prompt check** — at submit, Haiku reads your prompt alone and lists what is missing, up to three
  questions you answer with one click (the answers reach the model mid-turn) and the prompt rewritten.
- **Flow** — three stages, only the current one open (`1 before · 2 working · 3 done`, press one to look back):
  - *Before you send*: what you wrote, how Claude reads it (the plan's goal and assumptions, or Haiku's read),
    the questions, the finished prompt (`put in the prompt box` / `copy`) and what it runs with: the model
    (a `/model …` tip, filled in the box, never switched for you) and the effort for this message.
    With **hold long prompts** on, a typed prompt of 40+ words stops once and goes back into the box, so
    nothing is lost: `send the finished prompt`, `send mine`, or Enter sends it as is.
  - *While it works*: the plan's progress and the step under way, NEEDS YOU, and **What Agent Lens did**: one
    line per thing it did on its own (held the prompt, checked it, set the effort, asked for the plan, sent
    Claude to CodeGraph, passed on your answer, a default Claude used). Plan and Execution are folded.
  - *Done*: the goal, steps, cost, files changed, the log, "next time, write it like this", then the folded extras.
  A step the model would hand to a subagent on another model shows the suggestion; nothing is delegated until
  you press it.
- **Effort per message** (`effort auto · tip · off`) — read from your words alone, free (after wearenocode's
  Effort Picker, with Romanian words): a big handoff gets xhigh, an audit max, money, people, deploys, deletes or
  something broken get high, a quick question low, "da" / "ok" keep your level. Auto applies it to that message
  only; a level you set to xhigh or max is never lowered; `− lower` / `+ higher` while it works.
- **Band above the prompt** — the task (plan progress as a bar, `Tasks 2/3`), the step under way, the prompt
  cache clock (`keep warm`), context %, then one offer at a time: a held prompt with its gaps, the cache about to go
  cold, a handoff when the context passes the threshold, a correction to save as a rule; the effort of this message
  under it while it works. `✕` hides it until the next prompt.
- **Agents** — every subagent as a card (a pixel crab on the desktop), Running / Finished / Stopped, with its
  type, model, tokens, time, the plan step it works for, what it does now and all its steps.
- **Chat** — what this chat used: tools, connectors (MCP servers with their tools), files read and written,
  skills, the plan as a to-do, and the last turn's edits replayed one by one (`/replay`).
- **Reflect** — a correction in your words (free check) goes to Haiku, which keeps it only as a lasting rule;
  NEEDS YOU and the band offer to save it to this project's or the global `CLAUDE.md`.
- **Setup** — the switches of what used to be separate mods (helper-desk, brain-dump, cache-clock, handoff,
  reflect, effort-picker), the thresholds (handoff at context %, cache lifetime and warning, hold length), the
  other plugins from `settings.json` (on/off, counts after `/reload-plugins`), and the way into Hooks and Styles.
- **Git** — status, stage/unstage, diff per file, a Haiku-written commit message, commit, sync.
- **Memories** — the project's auto-memory: a health card (✓ fine / ◐ to look at / ✗ to delete), NEEDS YOU
  with one decision per row (a link to a memory that does not exist, grouped, `unlink` keeps the word; what
  the Sonnet audit flagged, with fix/delete; code that is gone; a memory outside `MEMORY.md`), then one
  section per type. The audit first checks the paths and symbols each memory names against the repo.

Every tab uses Flow's layout: a card on top with where things stand, NEEDS YOU for decisions, foldable
sections with the summary on the right.
- **Styles** (`Aa`, `y`) — the output styles, two lines each: the name (opens it to edit the description
  and instructions line by line) with `use` on the right, the description under it. `use` writes
  `outputStyle` in `settings.json`, read at the start of the next session; a new style starts as a copy of
  the active one.
- **Hooks** — Claude Code's own hooks from the settings files. Global hooks turn on/off; the project's
  (`.claude/settings.json`, `.claude/settings.local.json`) can be added, edited, deleted and turned off.
  "Off" parks the hook in a sibling `*.hooks-off.json`; a change applies from the next session.
- **CodeGraph first** — in a project with a `.codegraph/` index, `codegraph_explore` goes before Grep/Glob.

`/lens` opens the pane, `/replay` its Chat tab replaying the last turn's edits. Hotkeys inside it: `f` Flow,
`w` Agents, `i` Chat, `c` Git, `e` Memories, `o` Setup, `h` Hooks (in Setup), `y` Styles,
`k` prompt check, `n` miniplan, `g` codegraph, `b` hold long prompts, `v` effort mode; `1`-`4` answer the
first open question, `0` keeps its default.

## Install

At the prompt of a terminal session:

```
/plugin install agent-lens --marketplace ionutm87/agent-lens
```

Answer `y` to add the marketplace, then pick a scope (user is the first). From a shell:

```
claude plugin install agent-lens --marketplace ionutm87/agent-lens
```

In the desktop app: `+` next to the prompt box → Plugins → Add marketplace with `ionutm87/agent-lens` → Add plugin.

## Develop

```
git clone git@github.com:ionutm87/agent-lens.git
claude --plugin-dir ./agent-lens          # loads it for that session and hot-reloads on save
claude plugin validate ./agent-lens
claude plugin test ./agent-lens
```
