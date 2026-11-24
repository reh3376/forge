# Gates for coding agents

This guide is for a coding agent that works for the owner (GitHub user `reh3376`). The owner is the gate. At two points the agent stops: **Gate 1, before building**, and **Gate 2, before pushing**. At each one the agent says what it is about to do (Gate 1) or what it has ready (Gate 2), recommends checks, prints the gate's keyword table, and waits. The owner answers with `go` or with `+keywords`. Work that needs Gate 1 does not start before the owner answers it, and nothing is pushed before the owner answers Gate 2.

In the forge repository the one definition of both gates and every keyword is `.claude/skills/gates/SKILL.md`, and `CLAUDE.md` ("How work is done here (A-8)") makes the gates part of the workflow. Where this guide and those files disagree, those files win. This guide carries a copy of the keyword tables for agents that work somewhere else, and it describes how to make sure the tables really show.

| Section | What it covers |
|---|---|
| [1](#1-the-two-gates-in-brief) | The two gates in brief |
| [2](#2-prerequisite-the-pstack-plugin) | The pstack plugin: check, install, what to do without it |
| [3](#3-the-keywords) | The keyword tables (copied), chaining, order, `go`, unknown replies, the pstack skill behind each keyword |
| [4](#4-gate-1-before-building) | When Gate 1 opens and what its message says |
| [5](#5-gate-2-before-pushing) | When Gate 2 opens and what its message says |
| [6](#6-making-sure-the-tables-show) | Layers from soft to hard: `CLAUDE.md`, the `/gates` skill, hooks, a permission rule |
| [7](#7-table-toggles-gate1-and-gate2) | `+gate1` and `+gate2`: hiding or showing a table (proposed) |
| [8](#8-adopting-this-in-the-forge-repository) | Follow-ups for the owner to decide |
| [9](#9-checklists) | A checklist for each gate |
| [10](#10-what-was-verified-and-where) | Where each command and format in this guide was checked |

## 1. The two gates in brief

| | Gate 1: before building | Gate 2: before pushing |
|---|---|---|
| Opens | before any backlog item or change that is not purely mechanical, before any code is written; and again when a design question appears mid-build | as the last step before any `git push`, after every local check has run |
| The agent says | what is about to be built, its size (*mechanical*, *small*, *a decision*), the keywords it recommends and why | what is ready, what was run on the real thing and what it showed, the keywords it recommends and why |
| Then | prints the Gate 1 table and waits | prints the Gate 2 table and waits |
| `go` means | build now, with no design step | push now, with nothing added |

A gate is a full stop. The agent does not build, push, or start the next step while a gate is open, and it never answers a gate for the owner.

## 2. Prerequisite: the pstack plugin

Most keywords run a skill from the pstack plugin. pstack is installed per user, not in a repository. On the machine this guide was written on it is installed at user scope as `pstack@cursor-plugins`, version 0.15.46, from the marketplace `cursor-plugins` (GitHub repository `cursor/plugins`).

### Check that it is installed

Run either check. Both only read.

```bash
claude plugin list --json | python3 -c 'import json,sys; p=[x for x in json.load(sys.stdin) if x["id"]=="pstack@cursor-plugins"]; print(p[0]["version"], "enabled" if p[0]["enabled"] else "DISABLED") if p else print("pstack not installed")'
```

```bash
ls ~/.claude/plugins/cache/cursor-plugins/pstack/*/skills/blast-radius/SKILL.md
```

Where the state is recorded:

| Place | Installed and enabled looks like |
|---|---|
| `claude plugin list` | an entry `pstack@cursor-plugins` with `Version: …`, `Scope: user` and `Status: ✔ enabled` |
| `~/.claude/plugins/installed_plugins.json` | a key `"pstack@cursor-plugins"` whose `installPath` ends in `cache/cursor-plugins/pstack/<version>` |
| `~/.claude/plugins/known_marketplaces.json` | a key `"cursor-plugins"` with source `github`, repo `cursor/plugins` |
| `~/.claude/settings.json` | `"enabledPlugins": { "pstack@cursor-plugins": true }` |
| the plugin files | `~/.claude/plugins/cache/cursor-plugins/pstack/<version>/skills/<name>/SKILL.md`, one folder per skill |

A missing install looks like this: no `pstack@cursor-plugins` entry in `claude plugin list`, no such key in `installed_plugins.json`, and no `cache/cursor-plugins/pstack` folder. A plugin that is installed but turned off shows `"enabled": false` in the JSON list (the first check prints `DISABLED`).

### Install it (the owner types this)

The agent cannot run an interactive slash command for the owner, and installing a plugin changes the owner's settings (`enabledPlugins` in `~/.claude/settings.json`). The agent does not install pstack on its own. It tells the owner what to type, and waits.

In a Claude Code session, the owner types:

```text
/plugin marketplace add cursor/plugins
/plugin install pstack@cursor-plugins
```

`/plugin install` opens the plugin's details; the owner reviews what it adds and picks **Install for you (user scope)**. If the install summary ends with `Run /reload-plugins to apply.`, the owner runs `/reload-plugins`. Typing `/` then lists the skills as `/pstack:<skill>`.

From a shell, without a session, the same install is:

```bash
claude plugin marketplace add cursor/plugins
claude plugin install pstack@cursor-plugins
```

or in one command (Claude Code v2.1.292 or later): `claude plugin install pstack --marketplace cursor/plugins`. `claude plugin install` installs at user scope by default. Plugins installed from the shell load in the next session, or after `/reload-plugins` in an open one.

Other commands the owner may need:

| Need | Command |
|---|---|
| turn an installed but disabled pstack back on | `claude plugin enable pstack@cursor-plugins` |
| update it (third-party marketplaces do not auto-update by default) | `claude plugin update pstack@cursor-plugins` |

### If pstack is missing and cannot be installed

The agent says so plainly, names the keywords that cannot run (the table in [3.7](#37-the-pstack-skill-behind-each-keyword) shows which need pstack), and does not improvise a substitute for any of them. This is the rule in `.claude/skills/gates/SKILL.md`: "If the plugin or the skill is not there, the agent says so and does not improvise a substitute." It then waits for the owner's word: the owner may install pstack, choose other keywords, or answer `go`. `go`, `+cases`, the naming half of `+laws`, and a `+chart` drawn from the record need no plugin.

### How the agent runs a pstack skill

Every pstack skill a keyword uses sets `disable-model-invocation: true` in its frontmatter, so the agent cannot load it with its Skill tool; only the owner can start one by typing `/pstack:<name>`. For a keyword, the agent:

1. reads the plugin's Claude Code adapter once per session: `~/.claude/plugins/cache/cursor-plugins/pstack/<version>/docs/harness/claude-code.md` (it maps the tool and agent names pstack's skills use to Claude Code's);
2. reads `~/.claude/plugins/cache/cursor-plugins/pstack/<version>/skills/<name>/SKILL.md`, from the newest version present (the version `claude plugin list` shows), and follows it;
3. gives any subagent it starts for the keyword these limits in its brief: install nothing, touch no running service, push nothing, test against the project's signed records.

The project's rules win over any pstack text. A gate is exactly the "question shown to a person" that pstack tells an agent to avoid; here it is required.

## 3. The keywords

The tables below are copied word for word from `.claude/skills/gates/SKILL.md` in the forge repository on 2026-11-24, from the version last changed in commit `69522331`. That file is the source of truth in forge; this copy is for agents working elsewhere. The copy names forge's branch (`reh3376_dev01`) and forge's files (`CLAUDE.md`, `docs/decisions/`); in another project, read them as that project's branch and files.

<!-- gates-copy:begin (copied verbatim from .claude/skills/gates/SKILL.md; a test may compare them) -->

### 3.1 The two gates

| Gate | When the agent stops | What it says |
|---|---|---|
| **Gate 1: before building** | before starting any backlog item or any change that is not purely mechanical | what is about to be built, the size it judges it to be, and the checks it recommends |
| **Gate 2: before pushing** | when everything is ready to push to `reh3376_dev01` and nothing has been pushed | what is ready, the checks it recommends, and why |

**A gate reopens.** If a design question appears while building that the record did not settle, the agent stops and opens gate 1 again. It does not decide it alone and carry on.

**Size, said in one line at gate 1:** *mechanical* (a rename, a move with no change of behaviour, a documents-only change): no design step is recommended, and the reason is given. *Small* (a fix with a clear local cause): `+standard`. *A decision* (a new capability; a contract, schema or spec kind; the write path, the transport, time or security): `+design`.

### 3.2 Keywords at gate 1 (design)

| Keyword | Runs | Cost |
|---|---|---|
| `go` | build now, with no design step. For mechanical work; for anything else the agent says what is being skipped | none |
| `+standard` | `+problem +ground +cases`: the standard design pass, with no extra agents. The usual answer for work that is not mechanical | low |
| `+problem` | pstack `in-your-own-words`: the goal and the problem restated; the owner confirms or corrects | low |
| `+ground` | pstack `how` and `why`: what exists today and why it is shaped so, with the signed records that bear on it | low |
| `+sharpen` | pstack `sharpen`: what a top professional would do that was not asked for, and what other than the agent or the owner would show the result is right | low |
| `+shape` | pstack `architect`: two different shapes, and the one where each piece of state has one owner | medium |
| `+arena` | pstack `arena`: several candidates in parallel, the strongest parts merged | high (several agents) |
| `+cases` | Forge's own list, below: the design taken through each case, with what each changed | low |
| `+attack` | pstack `interrogate`: adversaries try to break the design; only findings a run proves survive | high (several agents) |
| `+laws` | the "always", "never" and "exactly once" statements named, and their proofs planned (pstack `create-formal-verification-skill` when built) | low |
| `+chart` | a state chart of the design (pstack `statechart` when a TLA+ model exists; otherwise drawn from the record) | low |
| `+design` | `+problem +ground +sharpen +shape +cases +attack +laws`, in that order, ending in a record under `docs/decisions/` | high |

### 3.3 Keywords at gate 2 (ship)

| Keyword | Runs | Cost |
|---|---|---|
| `go` | push now, with nothing added | none |
| `+blast` | pstack `blast-radius`: what the change breaks elsewhere, with the one fact it is safe because of proven by running code | medium |
| `+verify` | pstack `maintain-formal-verification-skill`: the formal proofs brought back in line with the code | medium |
| `+attack` | pstack `interrogate` on the finished change | high (several agents) |
| `+prove` | pstack `principle-prove-it-works`, as a script: the check on the real artifact is written down, rerun at the gate and its output shown; a check worth keeping becomes a test | low |
| `+ship` | `+blast +verify +prove` | medium |

**What gate 2 always says, whatever the answer** (working principle 1): what was run on the real thing and what it showed, or plainly that it was not proved and why. `go` never means "push without proving"; `+prove` adds the script and its output.

### 3.4 At either gate

| Reply | Meaning |
|---|---|
| `go` | proceed with nothing added (it is the first row of each gate's table) |
| `+a+b` or `+a +b` | run both; spaces do not matter and neither does the order typed |
| `+a go` | run it, then proceed without asking again if it found nothing |
| anything else | the agent says it does not know the keyword and prints the tables; it never guesses |

**Order.** Keywords run in the order of the tables, whatever order they were typed in. `+design` stops for the owner after `+problem` and again at the record's questions, which are asked one at a time.

**What ran is written down.** The commit message carries one line, for example `Checks: blast (no risk confirmed), verify (in sync)`, or `Checks: none (documents only; the owner said go)`.

### 3.5 The cases of `+cases`

The design is taken through each of these, and the record shows what each changed. A case that does not apply is said to not apply, with the reason.

1. **Scale:** a hundred times the data, the tags, the users, the modules.
2. **Change while in use:** a setting, a grant, a spec or a schema changes under something that is running.
3. **A hub cut off:** from the level above, from a module, from its databases; and what happens when it returns.
4. **No person is acting:** a script, a sequence, a scheduled job, another module.
5. **Failure and recovery:** a crash halfway, a retry, a restart, a second run of the same step.
6. **Renaming and migration:** a name, a path, an id or a format that others have stored.
7. **Before it is complete:** how the system behaves while only part of this exists, with no bypass path.
8. **The wrong thing made impossible:** which invalid states the shape still allows to be written.
9. **What it pins:** what becomes hard to change later, and what bounds that.
10. **How it is known to hold:** which statements are laws, and what proves each.

<!-- gates-copy:end -->

### 3.6 Reading the rules above

- **Chaining.** `+design+arena` and `+design +arena` are the same answer. A composite stands for its parts: `+standard` is `+problem +ground +cases`, `+design` is `+problem +ground +sharpen +shape +cases +attack +laws`, `+ship` is `+blast +verify +prove`. `+arena` is never part of `+design`; it runs only when the owner types it.
- **Order.** Whatever order the owner typed, the keywords run in the order of their table, top to bottom. A composite is read as its parts, and the parts run in table order too: `+arena +design` runs `+problem`, `+ground`, `+sharpen`, `+shape`, `+arena`, `+cases`, `+attack`, `+laws`. `+design` stops for the owner after `+problem`, and again at the record's questions, one question at a time.
- **`go`.** Alone, it means proceed with nothing added. After keywords (`+ship go`), it means run them, then proceed without asking again if they found nothing. If they found something, the agent reports it and the gate stays open. At Gate 2, `go` never means "push without proving": the gate message has already said what was run on the real thing.
- **Unknown or unclear replies.** Anything that is not `go` or a keyword of the open gate (or, where adopted, a toggle of section 7): the agent says it does not know the keyword, prints the tables, and waits. It never guesses.

### 3.7 The pstack skill behind each keyword

Paths are under `~/.claude/plugins/cache/cursor-plugins/pstack/<version>/skills/`.

| Gate | Keyword | pstack skill (folder) | Needs pstack | Notes |
|---|---|---|---|---|
| 1 | `go` | none | no | |
| 1 | `+standard` | `in-your-own-words`, `how`, `why`; the cases need none | yes | composite |
| 1 | `+problem` | `in-your-own-words` | yes | the owner confirms or corrects the restated goal |
| 1 | `+ground` | `how` and `why` | yes | |
| 1 | `+sharpen` | `sharpen` | yes | |
| 1 | `+shape` | `architect` | yes | |
| 1 | `+arena` | `arena` | yes | starts several agents |
| 1 | `+cases` | none: the ten cases in 3.5 | no | |
| 1 | `+attack` | `interrogate` | yes | starts several agents |
| 1 | `+laws` | `create-formal-verification-skill`, when a proof is built | for the proof only | naming the laws needs no plugin |
| 1 | `+chart` | `statechart`, when a TLA+ model exists | only with a model | otherwise drawn from the record |
| 1 | `+design` | `in-your-own-words`, `how`, `why`, `sharpen`, `architect`, `interrogate`, and `create-formal-verification-skill` for proofs | yes | composite; ends in a record |
| 2 | `go` | none | no | |
| 2 | `+blast` | `blast-radius` | yes | |
| 2 | `+verify` | `maintain-formal-verification-skill` | yes | |
| 2 | `+attack` | `interrogate` | yes | starts several agents |
| 2 | `+prove` | `principle-prove-it-works` | yes | written as a script; its output is shown at the gate |
| 2 | `+ship` | `blast-radius`, `maintain-formal-verification-skill`, `principle-prove-it-works` | yes | composite |

## 4. Gate 1: before building

**When it opens.** At the start of every new task or backlog item, before any code is written or any file is changed. `SKILL.md` says "before starting any backlog item or any change that is not purely mechanical". A purely mechanical change (a rename, a move with no change of behaviour, a documents-only change) still gets a gate when it is a backlog item; the recommendation is then `go`, with the reason. Reading files to prepare the gate message is allowed; writing is not.

**It opens again** when a design question appears while building that the record did not settle. The agent stops at that point, says what the question is, and opens Gate 1 again. It does not decide alone and carry on. A subagent never opens a gate itself; it reports the question to the agent that started it, which opens the gate.

**What the message contains, in this order:**

1. What is about to be built, in one or two sentences, and the item it belongs to.
2. The size, in one line: *mechanical* (no design step recommended, and why), *small* (a fix with a clear local cause: `+standard`), or *a decision* (a new capability; a contract, schema or spec kind; the write path, the transport, time or security: `+design`).
3. The recommended keywords and why; for anything not mechanical, what `go` would skip.
4. The Gate 1 table from 3.2, or, where the toggles of section 7 are adopted and the owner has hidden it, the one hidden-table line. In forge today the table is always printed.
5. Nothing after that. The agent stops and waits.

Example:

```text
Gate 1: before building <item>: <one sentence on what it changes>.
Size: a decision (it changes a time check, which fails closed).
Recommended: +design, because the change sits on the time path; +chart is not needed (no state machine changes).
go would skip the design step entirely.

| Keyword | Runs | Cost |
|---|---|---|
| `go` | build now, with no design step. ... | none |
...
```

## 5. Gate 2: before pushing

**When it opens.** As the last thing before any `git push`, after every local check the project requires has run (in forge: the documents match the code, the tutorial is updated and rebuilt, the full test suite, both lint checks, and a secrets scan of the commits). Nothing has been pushed. The agent never pushes before the owner answers. In forge it also never pushes to a branch whose pull request is open (`CLAUDE.md`, A-8 step 6).

**What the message contains, in this order:**

1. What is ready: the branch, the commit or commits, and what they change.
2. What was run on the real thing and what it showed (the command, and the value or output it produced), or plainly that it was not proved and why. This line is never left out, whatever the answer will be.
3. The local checks that ran and their results.
4. The recommendation and why. In forge, recommend `+blast` when the change touches the transport, the proto, a governed schema or a signed contract, moves files, or changes how something is found, packaged or imported; say plainly when a change does not qualify.
5. The Gate 2 table from 3.3, or, where the toggles of section 7 are adopted and the owner has hidden it, the one hidden-table line. In forge today the table is always printed.
6. Nothing after that. The agent stops and waits.

**After the answer.** The agent runs the keywords in table order. Every confirmed risk is fixed or written to the backlog before the push. The commit message records which checks ran, in one line: `Checks: ...`. The agent pushes only on `go`: `go` alone, `+keywords go` when the keywords found nothing, or a later `go` after the agent has reported what they found.

Example:

```text
Gate 2: ready to push <branch>.
Ready: <commit id> "<subject>": <what it changes>.
Run on the real thing: <command> -> <what it showed>.
Local checks: <test command> (<n> passed, <m> skipped with reasons); lint clean; format clean; secrets scan clean.
Recommended: go. +blast does not qualify: no transport, proto, governed schema or signed contract is touched, and no file moves.

| Keyword | Runs | Cost |
|---|---|---|
| `go` | push now, with nothing added | none |
...
```

## 6. Making sure the tables show

Four layers, from soft to hard. Each later layer catches what the one before can miss. Layers 6.3 and 6.4 change Claude Code settings: the agent describes them and installs them only on the owner's explicit word.

### 6.1 Instructions in the project's CLAUDE.md

Claude Code loads `CLAUDE.md` into every session. Forge's wording, from "How work is done here (A-8)", is the example to follow:

> **Gate 1, before building** (the owner, 2026-11-23): before starting an item or any change that is not purely mechanical, stop and say what is about to be built, its size (mechanical, small, a decision) and the checks recommended, print the gate's keywords, and wait for the owner's answer (`go`, `+standard`, or keywords such as `+design+arena`). If a design question appears while building that the record did not settle, stop and open gate 1 again.

> **Gate 2, before pushing** (the owner, 2026-11-23). When everything is ready and nothing is pushed, stop and say what is ready and which checks are recommended and why, print the gate's keywords, and wait (`go`, `+blast`, `+verify`, `+attack`, `+prove`, `+ship`). The gate message always says what was run on the real thing and what it showed. [...] **The keywords are defined in one place, `.claude/skills/gates/SKILL.md` (`/gates` prints them); every gate message prints its table, so the owner never has to remember one.**

An instruction can be forgotten in a long session. That is what the next layers are for.

### 6.2 The `/gates` skill

Reference implementation: `.claude/skills/gates/SKILL.md`. A project skill lives at `.claude/skills/<name>/SKILL.md` (a personal one at `~/.claude/skills/<name>/SKILL.md`), and the owner starts it by typing `/<name>`. Its frontmatter:

```yaml
---
name: gates
description: "Show the two gates of forge's workflow and every +keyword the owner can answer a gate with: what each runs, what it costs, and how to chain them. Use for /gates, 'what are my options', 'gate keywords', or whenever a gate is reached."
argument-hint: "[+keyword+keyword … | go]"
---
```

- `name` is the command (`/gates`); without it the folder name is used.
- `description` tells Claude when to load the skill on its own. "whenever a gate is reached" makes the agent load it at each gate.
- `argument-hint` is shown while the owner types. `/gates +design+arena` passes the keywords; the file has no `$ARGUMENTS` placeholder, so Claude Code appends them as `ARGUMENTS: <value>`, and the skill treats them as the answer to the open gate.
- There is no `disable-model-invocation: true`, so the agent can load the skill itself. Keep it that way.

With no keyword, the skill prints both tables and the chaining rule and says which gate, if any, is open. In another project, copy the file, then change its branch name and the files it points to.

### 6.3 Claude Code hooks

Hooks are commands Claude Code runs at fixed points; the agent cannot skip them. Two are proposed here: a reminder of the gates on every prompt, and a check that refuses a `git push` until the owner has answered Gate 2 with `go` for the content being pushed.

**Before installing.** A hook changes the owner's settings and runs with the owner's own rights. Claude Code's documentation says: "Command hooks execute shell commands with your full user permissions. They can modify, delete, or access any files your user account can access. Review and test all hook commands before adding them to your configuration." The agent does not install these hooks on its own; it shows the owner the script and the settings entries and waits for the owner's explicit approval.

#### Which events, and why

| Purpose | Event | Why this event |
|---|---|---|
| Remind the agent of Gate 1 when a task starts | `UserPromptSubmit` | A new task reaches the agent as a prompt, and this event fires "when a prompt is submitted, before Claude processes it". Its plain stdout on exit 0 is added to the agent's context. `SessionStart` fires only when a session starts, resumes, is cleared, compacted or forked, so a second task in the same session would get no reminder. `TaskCreated` fires when the agent adds an item to its own task list with the `TaskCreate` tool: after it has started planning, and not at all in sessions without that tool. |
| Refuse a push that Gate 2 did not clear | `PreToolUse`, matcher `Bash` | It fires before the Bash tool runs and can deny the call; the denial reason is shown to the agent. It also fires for tool calls made by subagents. |

`UserPromptSubmit` also fires on turns the owner did not type: a scheduled task firing, a background subagent reporting back, a message from another session. The documented input has no field that tells these apart from a typed prompt. The reminder is harmless on those turns; how the Gate 2 record treats them is described below.

#### What the hooks do

- **On every prompt** (`gates.py prompt`): print two lines, the gate rule and whether each keyword table is shown (read from `.claude/gates.local.json`, section 7). If Gate 2 is open, the message being submitted is taken as the answer to it, whatever it says: Gate 2 is then closed, and the answer is recorded in `.claude/gate2.answered` only if the message is made only of Gate 2 keywords (and table toggles), includes `go`, and the commit is still the one the gate was opened for. The hook prints one line saying what it recorded or why it recorded nothing. It never blocks a prompt.
- **Before every Bash call that contains `push`** (`gates.py pre-push`): find each `git push` in the command (also inside `&&` chains, `$()`, backticks, `sh -c '...'`, after `VAR=value` prefixes, with an absolute path to git, and with `git -C <dir>`). For each, compare the repository's HEAD with `.claude/gate2.answered`. If no answer is recorded, or it was given for different content, deny the call and say why. `git push --dry-run` and `git push -n` are let through. Any error in the check denies the push, with the cause.
- **When the agent opens Gate 2** (`gates.py open-gate2`, run by the agent): refuse if tracked files have uncommitted changes (the owner answers for a commit); otherwise write `.claude/gate2.open` for HEAD.

**What an answer is bound to.** The suggested design was a marker holding the commit id, compared with `git rev-parse HEAD`. This script binds the answer to the commit's content (`git rev-parse 'HEAD^{tree}'`) and to the commit it sits on (`HEAD^`) instead. Reason: the `Checks: ...` line is often written into the commit message after the owner answers, and amending the message changes the commit id but neither of those two. Any change to a file, or to the history underneath, changes one of them, and the push is refused until Gate 2 is opened again.

**State files.** All three live in `.claude/` at the top of the repository (`git rev-parse --show-toplevel`), and git must ignore them:

| File | Written by | Read by | Holds |
|---|---|---|---|
| `.claude/gates.local.json` | the agent, on the owner's toggle | the agent; the prompt hook | which tables are shown (section 7) |
| `.claude/gate2.open` | `gates.py open-gate2` | the prompt hook, which deletes it on the next message | `tree`, `parent`, `head`, `opened` (UTC) |
| `.claude/gate2.answered` | the prompt hook only | the push hook | `tree`, `parent`, `answer` (the owner's words), `at` (UTC) |

Each file has one writer, so no two actors write the same file.

#### The script: `.claude/hooks/gates.py`

Standard library only; it needs `python3` and `git` on `PATH`. It was run on 2026-11-24 against throwaway repositories, under Python 3.9 and 3.14, for each case named above. It has not been run as a live hook in a Claude Code session.

```python
#!/usr/bin/env python3
"""The two gates, as Claude Code hooks. Standard library only.

  prompt      UserPromptSubmit hook. Prints a short gate reminder (Claude Code adds it to the
              agent's context) and, when Gate 2 is open, records the owner's `go`.
  pre-push    PreToolUse hook on Bash. Denies a `git push` unless Gate 2 was answered with
              `go` for the commit being pushed.
  open-gate2  Run by the agent just before it prints the Gate 2 message.

State lives in <repository top>/.claude/ and must be ignored by git:
  gates.local.json  the owner's table toggles (written by the agent, read here)
  gate2.open        Gate 2 is open for this commit (written by open-gate2)
  gate2.answered    the owner answered Gate 2 with go (written only by the prompt hook)
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

GATE2_WORDS = {"go", "+blast", "+verify", "+attack", "+prove", "+ship"}
TOGGLE = re.compile(r"\+gate[12]\s+(?:enable|disable)\b")
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
WRAPPERS = {"env", "command", "exec", "nohup", "time", "xargs"}
SHELLS = {"sh", "bash", "zsh", "dash"}
GIT_VALUE_OPTIONS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"}


def git(cwd: Path, *args: str) -> str | None:
    run = subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True)
    return run.stdout.strip() if run.returncode == 0 else None


def state_dir(cwd: Path) -> Path:
    top = git(cwd, "rev-parse", "--show-toplevel")
    return Path(top or os.environ.get("CLAUDE_PROJECT_DIR") or cwd) / ".claude"


def snapshot(cwd: Path) -> dict | None:
    """What the owner approves: the commit's content (tree) and the commit it sits on."""
    tree = git(cwd, "rev-parse", "HEAD^{tree}")
    if tree is None:
        return None
    return {"tree": tree, "parent": git(cwd, "rev-parse", "--verify", "-q", "HEAD^") or ""}


def read_json(path: Path) -> tuple[dict | None, str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, "absent"
    except (OSError, ValueError) as error:
        return None, f"unreadable ({error})"
    return (data, "") if isinstance(data, dict) else (None, "not a JSON object")


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def tables(cwd: Path) -> str:
    data, problem = read_json(state_dir(cwd) / "gates.local.json")
    if data is None:
        return "Keyword tables: both shown" + ("" if problem == "absent" else f" (gates.local.json {problem})")
    values = {key: data.get(key, True) for key in ("gate1_table", "gate2_table")}
    if not all(isinstance(value, bool) for value in values.values()):
        return "Keyword tables: both shown (gates.local.json holds a value that is not true or false)"
    words = {True: "shown", False: "hidden"}
    return f"Keyword tables: gate 1 {words[values['gate1_table']]}, gate 2 {words[values['gate2_table']]}"


def is_go_answer(prompt: str) -> bool:
    words = re.findall(r"\+[a-z0-9]+|[^\s+]+", TOGGLE.sub(" ", prompt.strip().lower()))
    return bool(words) and set(words) <= GATE2_WORDS and "go" in words


def on_prompt(event: dict) -> int:
    cwd = Path(event.get("cwd") or os.getcwd())
    lines = [
        "Gate rule: Gate 1 opens before building anything that is not purely mechanical; "
        "Gate 2 opens before any git push. At each gate the agent stops and waits for the owner.",
    ]
    try:
        lines.append(tables(cwd))
        opened_path = state_dir(cwd) / "gate2.open"
        if opened_path.exists():
            opened, problem = read_json(opened_path)
            opened_path.unlink()  # the owner's next message answers the gate, whatever it says
            now = snapshot(cwd)
            if not is_go_answer(event.get("prompt") or ""):
                lines.append("Gate 2 was open; this message is not a go, so no push is recorded.")
            elif opened is None:
                lines.append(f"Gate 2 answer not recorded: gate2.open {problem}. Reopen Gate 2.")
            elif now is None or now != {"tree": opened.get("tree"), "parent": opened.get("parent")}:
                lines.append("Gate 2 answer not recorded: the commit changed after Gate 2 opened. Reopen Gate 2.")
            else:
                answer = {**now, "answer": event["prompt"].strip(), "at": datetime.now(timezone.utc).isoformat()}
                write_json(state_dir(cwd) / "gate2.answered", answer)
                lines.append(f"Gate 2 answered with go for tree {now['tree'][:12]}; a git push of it is allowed.")
    except Exception as error:  # never block the owner's prompt; say what failed
        lines.append(f"Gate hook error: {error!r}. Tables shown; no Gate 2 answer recorded.")
    print("\n".join(lines))
    return 0


def words_of(command: str) -> list[list[str]]:
    """Split a shell command into simple commands (best effort)."""
    text = command.replace("\n", " ; ").replace("`", " ; ")
    lexer = shlex.shlex(text, posix=True, punctuation_chars=";&|()")
    lexer.whitespace_split = True
    segments: list[list[str]] = [[]]
    for token in lexer:
        if set(token) <= set(";&|()"):
            segments.append([])
        else:
            segments[-1].append(token)
    return [segment for segment in segments if segment]


def pushes(command: str, cwd: Path, depth: int = 0) -> list[Path]:
    """The repositories a command pushes from. Unparseable text that names git and push counts."""
    try:
        segments = words_of(command)
    except ValueError:
        return [cwd] if re.search(r"\bgit\b", command) and "push" in command else []
    found: list[Path] = []
    for words in segments:
        i = 0
        while i < len(words) and ASSIGNMENT.match(words[i]):
            i += 1
        while i < len(words) and os.path.basename(words[i]) in WRAPPERS:
            i += 1
            while i < len(words) and (words[i].startswith("-") or ASSIGNMENT.match(words[i])):
                i += 1
        if i >= len(words):
            continue
        name, rest = os.path.basename(words[i]), words[i + 1 :]
        if name == "cd" and rest:
            cwd = cwd / os.path.expanduser(rest[0])
        elif name in SHELLS and depth < 3:
            for j, word in enumerate(rest[:-1]):
                if re.fullmatch(r"-[a-z]*c[a-z]*", word):
                    found += pushes(rest[j + 1], cwd, depth + 1)
                    break
        elif name == "git":
            repo, j = cwd, 0
            while j < len(rest) and rest[j].startswith("-"):
                if rest[j] in GIT_VALUE_OPTIONS and j + 1 < len(rest):
                    if rest[j] == "-C":
                        repo = repo / os.path.expanduser(rest[j + 1])
                    j += 2
                else:
                    j += 1
            if j < len(rest) and rest[j] == "push" and not {"-n", "--dry-run"} & set(rest[j + 1 :]):
                found.append(repo)
    return found


def deny(reason: str) -> int:
    decision = {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}
    print(json.dumps({"hookSpecificOutput": decision}))
    return 0


def on_pre_tool(event: dict) -> int:
    try:
        if event.get("tool_name") != "Bash":
            return 0
        command = (event.get("tool_input") or {}).get("command") or ""
        for repo in pushes(command, Path(event.get("cwd") or os.getcwd())):
            now = snapshot(repo)
            if now is None:
                return deny(f"Gate 2 check: cannot read HEAD in {repo}; push refused.")
            answered, problem = read_json(state_dir(repo) / "gate2.answered")
            if answered is None:
                return deny(
                    f"Gate 2 has not been answered (gate2.answered {problem}). Run the open-gate2 step, "
                    "print the Gate 2 message and wait for the owner's go. If the owner already said go, "
                    "the prompt hook did not record it: check /hooks."
                )
            if {"tree": answered.get("tree"), "parent": answered.get("parent")} != now:
                return deny(
                    "Gate 2 was answered for different content than HEAD now holds "
                    f"(answered tree {str(answered.get('tree'))[:12]}, HEAD tree {now['tree'][:12]}). "
                    "Reopen Gate 2 for this commit and wait for the owner."
                )
        return 0
    except Exception as error:  # fail closed, with the cause
        return deny(f"Gate 2 check failed ({error!r}); push refused.")


def open_gate2() -> int:
    cwd = Path.cwd()
    changes = git(cwd, "status", "--porcelain", "--untracked-files=no")
    if changes is None:
        print("Gate 2 not opened: not in a git repository.", file=sys.stderr)
        return 1
    if changes:
        print("Gate 2 not opened: tracked files have uncommitted changes. Commit first.", file=sys.stderr)
        return 1
    now = snapshot(cwd)
    if now is None:
        print("Gate 2 not opened: HEAD has no commit.", file=sys.stderr)
        return 1
    head = git(cwd, "rev-parse", "HEAD") or ""
    write_json(state_dir(cwd) / "gate2.open", {**now, "head": head, "opened": datetime.now(timezone.utc).isoformat()})
    print(f"Gate 2 open for commit {head[:12]} (tree {now['tree'][:12]}). The owner's next message answers it.")
    return 0


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "open-gate2":
        return open_gate2()
    if mode == "prompt":
        return on_prompt(json.load(sys.stdin))
    if mode == "pre-push":
        try:
            event = json.load(sys.stdin)
        except ValueError as error:
            return deny(f"Gate 2 check could not read its input ({error}); refused.")
        return on_pre_tool(event)
    print("usage: gates.py prompt | pre-push | open-gate2", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

#### The settings entries

These go in `.claude/settings.local.json` for the owner's own use in one project (forge's `.gitignore` already ignores that file), or in `.claude/settings.json` to share them with everyone who works in the repository. If the file already has `hooks.UserPromptSubmit` or `hooks.PreToolUse` arrays (forge's local settings on the owner's machine do), add these entries to the arrays; do not replace what is there.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/gates.py", "prompt"],
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(*push*)",
            "command": "python3",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/gates.py", "pre-push"],
            "timeout": 10,
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

- `"command": "python3"` with `args` is the documented exec form: no shell, and `${CLAUDE_PROJECT_DIR}` (the project root where the session started) is substituted into each argument as a plain string, so a path with spaces needs no quoting.
- `"if": "Bash(*push*)"` uses permission-rule syntax, where `*` can stand anywhere; the hook runs only for Bash calls that contain `push`. Claude Code checks each part of a compound command and also runs the hook when it cannot split a command. Without the `if` line the script still exits at once for commands that are not a push, but it would then start on every Bash call.
- `"onFailure": "block"` (Claude Code v2.1.295 or later) blocks the push when the hook cannot start, times out or exits with a code other than 0 or 2. Because of the `if` line, a broken hook blocks only commands that contain `push`, not every Bash call. The prompt hook has no `onFailure`: a broken reminder must not block the owner's prompts. If it fails, no answer is recorded, and the push is refused with a message that says to check `/hooks`.
- `"timeout": 10` is in seconds. The documented defaults are 30 for `UserPromptSubmit` and 600 for other command hooks.
- `/hooks` in a session shows the configured hooks (read only). Claude Code's documentation says direct edits to hooks in settings files "are normally picked up automatically by the file watcher".

#### How the agent works with the hooks installed

1. Commit the change before opening Gate 2.
2. Run `python3 .claude/hooks/gates.py open-gate2` from the repository. If it refuses, fix what it names; do not open the gate without it.
3. Print the Gate 2 message and stop.
4. The owner's next message answers the gate. The prompt hook's line in the agent's context says whether a push is now allowed. If anything else arrived first (a background report, a scheduled task), the gate was closed without a record: open it again (step 2).
5. Writing `Checks: ...` into the commit message after the answer is fine. Changing a file, or rebasing, means opening Gate 2 again.
6. Never write or delete `.claude/gate2.answered` by hand, and never work around a denial. A denial is answered by opening Gate 2.

#### What the hooks do not do

- They are not a security boundary. Claude Code's documentation says of the `if` filter that it is best-effort and that the permission system, not a hook, should enforce a hard allow or deny; it says the same of Bash permission rules. The push hook reads command text. It does not see a push made by a script, an alias, another tool (`gh`), or `git --git-dir=<dir>` / `--work-tree=<dir>` (those are checked against the working directory's repository).
- The check is on HEAD. A push of a ref other than the checked-out branch (`git push origin other-branch`) is still compared with HEAD.
- They guard against forgetting a gate, not against an agent acting in bad faith: an agent can write the state files itself. Step 6 above forbids that.
- They do not print the table. Only the agent writes the gate message.

### 6.4 A permission rule (optional, hardest)

Claude Code's permission rules are evaluated even when a hook allows a call. An `ask` rule makes Claude Code show the owner the exact push command and wait for approval:

```json
{
  "permissions": {
    "ask": ["Bash(git push *)"]
  }
}
```

`Bash(git push *)` also matches a bare `git push`, and an ask rule applies when any part of a compound command matches, including in auto mode. It does not match `git -C . push` or `git -c push.default=current push` (Claude Code's documentation names both), which the hook in 6.3 does catch. In `bypassPermissions` mode Claude Code skips permission prompts, and in `dontAsk` mode it denies the call instead of asking. Adding this rule needs the owner's word, as the hooks do.

## 7. Table toggles: `+gate1` and `+gate2`

**Status: proposed.** These four replies are not defined in `.claude/skills/gates/SKILL.md`. In the forge repository, until the owner adopts them (section 8), they are unknown keywords there: the agent says so and prints the tables, and every gate message prints its table, as `CLAUDE.md` requires. In a project that has adopted them, they work as follows.

### What they are

| Reply | Effect |
|---|---|
| `+gate1 disable` | Gate 1 messages stop printing the Gate 1 table |
| `+gate1 enable` | Gate 1 messages print the table again |
| `+gate2 disable` | Gate 2 messages stop printing the Gate 2 table |
| `+gate2 enable` | Gate 2 messages print the table again |

### What they change, and what they do not

- They change **only** whether the keyword table is printed in the gate message. The gate itself always happens: the agent still stops, says what it is about to do or has ready, says what was run on the real thing (Gate 2), recommends keywords with the reason, and waits. Disabling a table never means skipping a gate, and a toggle is never an answer to a gate.
- When a table is hidden, the gate message ends with one line instead of the table. At Gate 1:

  > Keyword table hidden; `+gate1 enable` shows it; `/gates` prints both.

  At Gate 2:

  > Keyword table hidden; `+gate2 enable` shows it; `/gates` prints both.

- Whatever the toggles say, both tables are printed by `/gates`, after an unknown keyword, and after any reply the agent does not understand.

### Where the state lives

A small per-user file that git ignores: `.claude/gates.local.json` at the top of the repository (`git rev-parse --show-toplevel`), so it survives new sessions.

```json
{"gate1_table": true, "gate2_table": true}
```

- **Default: shown.** A missing file, or a missing key, means `true`.
- **Values are JSON `true` or `false` only.** A string such as `"false"`, a number, or a file that is not valid JSON makes the whole file count as unreadable: both tables are shown, and the gate message says in one line that the file was unreadable and why. A bad file never hides a table silently.
- **One writer.** Only the agent writes the file, and only on the owner's toggle. It reads the file, changes the one key, and writes both keys back. A toggle that is already in effect changes nothing and is still confirmed.
- **Read at each gate.** The agent reads the file when it composes each gate message, not once per session, so a change made in another session takes effect at the next gate.
- In a separate git worktree the file is not shared; with no file there, both tables are shown.
- If the agent cannot write the file, it says so; the setting has not changed.

### How a reply with toggles is read

1. Toggles can be given alone or with other keywords, in any position: `+gate1 disable`, `+gate1 disable go`, `go +gate2 disable`, `+ship +gate2 disable`.
2. The reply is understood as a whole or not at all. If any part is unknown (`+gate1` without `enable` or `disable`, `+gate1 off`, `+gate3 disable`), or the reply both enables and disables the same table, nothing is applied: the agent says what it did not understand, prints both tables, and waits.
3. Toggles are applied first. The agent confirms each one in one line, for example:

   > Gate 1 table hidden from now on (saved in `.claude/gates.local.json`; `+gate1 enable` shows it).

4. What remains is the answer to the open gate, read by the rules in section 3. If nothing remains (a toggle alone), the gate stays open: the agent says so in one line and waits. A toggle alone is never `go`.
5. A toggle given when no gate is open is applied and confirmed, and nothing else happens.

### With the hooks of 6.3

- The prompt hook reads the same file and prints `Keyword tables: gate 1 shown, gate 2 hidden` (or `both shown`, with the reason when the file is unreadable) into the agent's context on every prompt. The file stays the authority; the agent reads it again at the gate.
- The prompt hook ignores toggle words when it decides whether a Gate 2 reply is a `go`: `+gate2 disable go` records the answer.
- The push hook does not read the file. Hiding a table never changes whether a push is allowed.

## 8. Adopting this in the forge repository

Follow-ups for the owner to decide. None has been done; this guide is the only file this change adds.

1. **Define the toggles in `.claude/skills/gates/SKILL.md`**, the one place keywords are defined. Put them in their own section (for example "Table toggles"), not as rows of the keyword tables, because a toggle is not an answer to a gate. Extend the "At either gate" table so that `+gate1` and `+gate2` with `enable` or `disable` are no longer "anything else".
2. **Extend `tests/test_gates.py`.** Its row pattern (`` `(\+?[a-z]+)` ``) and the pattern that checks keywords named in `CLAUDE.md` do not match names with a digit, so `+gate1` placed in a keyword table, or named in `CLAUDE.md`, would go unchecked. Add a test that the toggle section names the four replies, the file path, the default (shown) and the hidden-table line.
3. **Amend `CLAUDE.md`** ("How work is done here (A-8)", step 3). It says "every gate message prints its table, so the owner never has to remember one". Allowing a hidden table needs the owner's amendment, for example: "every gate message prints its table unless the owner has hidden it with `+gate1 disable` or `+gate2 disable`; the message then says how to show it".
4. **Ignore the state files.** Add to `.gitignore`:

   ```gitignore
   .claude/gates.local.json
   .claude/gate2.*
   ```

   Until then the files show as untracked and could be committed by a broad `git add`; adding the same lines to `.git/info/exclude` keeps them out in one clone without changing a tracked file.
5. **The hooks** (6.3) and the permission rule (6.4) need the owner's explicit approval: which settings file, and whether `gates.py` is committed under `.claude/hooks/`. Where a settings file already holds hook arrays for `PreToolUse` or `UserPromptSubmit`, the new entries are added beside the existing ones.
6. **A test that keeps the copy in this guide equal to `SKILL.md`.** The copied block sits between `<!-- gates-copy:begin` and `<!-- gates-copy:end -->`. A test can take the body of each `SKILL.md` section copied here ("The two gates", both keyword sections, "At either gate", "The cases of `+cases`") and assert it appears verbatim inside the block, and check that the copy date and commit in section 3 are current.
7. **A law.** "No push happens without the owner's `go` for this content" is a "never" statement. If the hooks are adopted, `CLAUDE.md` ("A law is proved") asks for an exhaustive check on the real code and a `.claude/skills/verify-*` skill for it.
8. **The state documents.** The forge workflow asks that `docs/WHERE-WE-ARE.md`, `BACKLOG.md` and the tutorial match each push. This guide changes none of them. Whether the follow-ups above become backlog items is the owner's call.

## 9. Checklists

### At Gate 1

- [ ] A new task, a backlog item, or a design question mid-build? Then the gate opens. Nothing has been written yet.
- [ ] Read `.claude/gates.local.json` (where adopted; absent or unreadable means shown).
- [ ] Say what is about to be built and the item it belongs to.
- [ ] Say the size in one line: mechanical, small, or a decision.
- [ ] Recommend keywords and say why; say what `go` would skip.
- [ ] Print the Gate 1 table, or the one hidden-table line.
- [ ] Stop. Build nothing until the owner answers.
- [ ] On the answer: apply toggles first and confirm each; anything unknown means nothing is applied, both tables printed, wait again.
- [ ] Check pstack is installed for the keywords that need it; if not, say so and wait, with no substitute.
- [ ] Run the keywords in table order; `+design` stops after `+problem` and at each question.

### At Gate 2

- [ ] Every local check the project requires has run; nothing is pushed; in forge, no pull request is open on the branch.
- [ ] The change is committed. With hooks: `python3 .claude/hooks/gates.py open-gate2` succeeded.
- [ ] Read `.claude/gates.local.json` (where adopted).
- [ ] Say what is ready.
- [ ] Say what was run on the real thing and what it showed, or that it was not proved and why.
- [ ] Recommend keywords and say why (`+blast` when it qualifies; say so when it does not).
- [ ] Print the Gate 2 table, or the one hidden-table line.
- [ ] Stop. Do not push.
- [ ] On the answer: toggles first; run the keywords in table order; fix or write to the backlog every confirmed risk.
- [ ] Write the `Checks: ...` line into the commit message.
- [ ] Push only on `go`. If the content changed after the answer, open Gate 2 again.

## 10. What was verified, and where

Checked on 2026-11-24 with Claude Code 2.1.331.

| Item | Where it was verified |
|---|---|
| marketplace `cursor-plugins` = GitHub `cursor/plugins`; plugin id `pstack@cursor-plugins`, version 0.15.46, user scope | `~/.claude/plugins/known_marketplaces.json`, `~/.claude/plugins/installed_plugins.json`, the marketplace's `.claude-plugin/marketplace.json`, `claude plugin list` and `claude plugin list --json` |
| `/plugin marketplace add cursor/plugins`, `/plugin install pstack@cursor-plugins`, `claude plugin update pstack@cursor-plugins` | the pstack README in the plugin cache; Claude Code docs, "Install and manage plugins" (code.claude.com/docs/en/discover-plugins) |
| `claude plugin marketplace add`, `claude plugin install` (user scope by default, `--scope`, `--marketplace`), `claude plugin enable`, `claude plugin update`, `claude plugin list --json` | `claude plugin --help` and each subcommand's `--help` on this machine; the same docs page |
| `/reload-plugins`, `/pstack:<skill>` naming, auto-update off by default for third-party marketplaces | the same docs page; the pstack README |
| pstack skills set `disable-model-invocation: true`; the Claude Code adapter `docs/harness/claude-code.md` | the frontmatter of the twelve skill files named in 3.7; the adapter file in the plugin cache |
| skill frontmatter (`name`, `description`, `argument-hint`, `disable-model-invocation`), skill locations, `ARGUMENTS:` appending | Claude Code docs, skills page (code.claude.com/docs/en/skills) |
| hook events `UserPromptSubmit`, `SessionStart`, `PreToolUse`, `TaskCreated`; input fields `cwd`, `prompt`, `tool_name`, `tool_input.command`; plain stdout as context; exit codes; `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason`; hooks in subagents | Claude Code docs, hooks reference (code.claude.com/docs/en/hooks) |
| `matcher`, `if`, exec form (`command` + `args`), `${CLAUDE_PROJECT_DIR}`, `timeout` defaults, `onFailure` (v2.1.295+), settings file locations, `/hooks`, the security warning | the same hooks reference |
| `permissions.ask`, `Bash(git push *)` matching (bare command, compound commands, forms it misses), modes, rules evaluated regardless of hook decisions | Claude Code docs, permissions page (code.claude.com/docs/en/permissions) |
| `.claude/settings.local.json` ignored by forge's `.gitignore`; `.claude/gates.local.json` not ignored today | `git check-ignore -v` on this repository |
| `gates.py` behaviour | run against throwaway repositories: pushes found in each documented form, non-pushes passed, `+ship` alone not recorded, `+ship go` recorded, message-only amend allowed, content change refused, a commit made after the gate opened refused, an unreadable toggle file reported, bad input refused |

Not verified: the hooks and the permission rule were not installed or run in a live Claude Code session, because installing them changes settings and needs the owner's word. Whether a `PreToolUse` hook that prints nothing leaves the normal permission prompt in place is taken from the documentation's general rule ("the action goes ahead unless those fields block or deny it"); the hooks reference states it for allow and deny, not for empty output.
