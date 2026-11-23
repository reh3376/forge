---
name: gates
description: "Show the two gates of forge's workflow and every +keyword the owner can answer a gate with: what each runs, what it costs, and how to chain them. Use for /gates, 'what are my options', 'gate keywords', or whenever a gate is reached."
argument-hint: "[+keyword+keyword … | go]"
---

# The gates

Forge front-loads every decision (`CLAUDE.md`, standing rules). The owner is the gate: at two points the agent stops, says what it is about to do, recommends checks, **prints the table below**, and waits. The owner answers with keywords. This file is the one place the keywords are defined; a gate message, `/gates` and `CLAUDE.md` all take them from here.

When this skill is invoked with no keyword, print the two tables and the chaining rule, and say which gate (if any) is open right now. When it is invoked with keywords, treat them as the owner's answer to the open gate.

## The two gates

| Gate | When the agent stops | What it says |
|---|---|---|
| **Gate 1: before building** | before starting any backlog item or any change that is not purely mechanical | what is about to be built, the size it judges it to be, and the checks it recommends |
| **Gate 2: before pushing** | when everything is ready to push to `reh3376_dev01` and nothing has been pushed | what is ready, the checks it recommends, and why |

**A gate reopens.** If a design question appears while building that the record did not settle, the agent stops and opens gate 1 again. It does not decide it alone and carry on.

**Size, said in one line at gate 1:** *mechanical* (a rename, a move with no change of behaviour, a documents-only change): no design step is recommended, and the reason is given. *Small* (a fix with a clear local cause): `+standard`. *A decision* (a new capability; a contract, schema or spec kind; the write path, the transport, time or security): `+design`.

## Keywords at gate 1 (design)

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

## Keywords at gate 2 (ship)

| Keyword | Runs | Cost |
|---|---|---|
| `go` | push now, with nothing added | none |
| `+blast` | pstack `blast-radius`: what the change breaks elsewhere, with the one fact it is safe because of proven by running code | medium |
| `+verify` | pstack `maintain-formal-verification-skill`: the formal proofs brought back in line with the code | medium |
| `+attack` | pstack `interrogate` on the finished change | high (several agents) |
| `+prove` | pstack `principle-prove-it-works`, as a script: the check on the real artifact is written down, rerun at the gate and its output shown; a check worth keeping becomes a test | low |
| `+ship` | `+blast +verify +prove` | medium |

**What gate 2 always says, whatever the answer** (working principle 1): what was run on the real thing and what it showed, or plainly that it was not proved and why. `go` never means "push without proving"; `+prove` adds the script and its output.

## At either gate

| Reply | Meaning |
|---|---|
| `go` | proceed with nothing added (it is the first row of each gate's table) |
| `+a+b` or `+a +b` | run both; spaces do not matter and neither does the order typed |
| `+a go` | run it, then proceed without asking again if it found nothing |
| anything else | the agent says it does not know the keyword and prints the tables; it never guesses |

**Order.** Keywords run in the order of the tables, whatever order they were typed in. `+design` stops for the owner after `+problem` and again at the record's questions, which are asked one at a time.

**What ran is written down.** The commit message carries one line, for example `Checks: blast (no risk confirmed), verify (in sync)`, or `Checks: none (documents only; the owner said go)`.

## The cases of `+cases`

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

## How the agent runs a pstack skill

pstack is installed per user, not in the repository. Most of its skills are typed by the owner; the agent cannot start them. For a keyword, the agent reads the skill's own instructions from the installed plugin (`~/.claude/plugins/cache/cursor-plugins/pstack/<version>/skills/<name>/SKILL.md`, the newest version present) and follows them. If the plugin or the skill is not there, the agent says so and does not improvise a substitute.

**Forge's rules win over any pstack text** (`CLAUDE.md`, "Skills from the pstack plugin"). In particular a gate is exactly the "question shown to a person" that pstack tells an agent to avoid: here it is required. A subagent started for a keyword is told to install nothing, to touch no running service, to push nothing, and to test against the signed records.
