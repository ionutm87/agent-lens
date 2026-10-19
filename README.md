# Agent Lens

A Claude Code sidebar (a mod: a hooks module drawn as a pane). Per turn it shows how the model understood
the request and how it split it (the Flow tab, published through the `plan` tool), the execution step by
step with each step's model, tokens and cost, and the subagent workers. Around it:

- **Prompt check** — at submit, Haiku reads your prompt alone and lists what is missing, up to three
  questions you answer with one click (the answers reach the model mid-turn) and the prompt rewritten.
- **Routing** — off by default. `[haiku]`, `[sonnet]` or `[opus]` at the start of a prompt pins that turn's
  model. Turned on, the model delegates searches to Haiku and mechanical edits to Sonnet, a final Opus
  validation runs on turns that edited files on a cheaper model, failures on a cheap model raise similar
  tasks a tier, and a retrospective after each turn says where cheaper delegation was possible.
- **Git** — status, stage/unstage, diff per file, a Haiku-written commit message, commit, sync.
- **Memories** — the project's auto-memory as a graph, how it reaches the model, and a Sonnet audit
  (relevant / stale / irrelevant).
- **Styles** (`Aa`) — list, pick, edit and create output styles.
- **Hooks** — Claude Code's own hooks from the settings files. Global hooks turn on/off; the project's
  (`.claude/settings.json`, `.claude/settings.local.json`) can be added, edited, deleted and turned off.
  "Off" parks the hook in a sibling `*.hooks-off.json`; a change applies from the next session.
- **CodeGraph first** — in a project with a `.codegraph/` index, `codegraph_explore` goes before Grep/Glob.

`/lens` opens the pane. Hotkeys inside it: `f` Flow, `c` Git, `e` Memories, `h` Hooks, `y` Styles,
`r` routing, `k` prompt check, `n` miniplan, `g` codegraph.

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
