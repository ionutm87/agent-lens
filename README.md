# Agent Lens

A Claude Code sidebar (a mod: a hooks module drawn as a pane). Per turn it shows how the model understood
the request and how it split it (the Flow tab, published through the `plan` tool), the execution step by
step with each step's model, tokens and cost, and the subagent workers. Around it:

- **Prompt check** — at submit, Haiku reads your prompt alone and lists what is missing, up to three
  questions you answer with one click (the answers reach the model mid-turn) and the prompt rewritten.
- **Flow** — a "now" card (the request, understand → plan → execute → done, the plan's progress and the
  step under way), what needs you (questions with numbered options, `0` keeps the default), the plan as a
  checklist (`1a`, `1b` run in parallel; press a step for its details), the execution one row per step,
  and "next time, write it like this" always last. A step the model would hand to a subagent on another model shows the suggestion;
  nothing is delegated until you press it. No model routing: the session model does the work.
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

`/lens` opens the pane. Hotkeys inside it: `f` Flow, `c` Git, `e` Memories, `h` Hooks, `y` Styles,
`k` prompt check, `n` miniplan, `g` codegraph; `1`-`4` answer the first open question, `0` keeps its default.

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
