# CLAUDE.md

Guidance for Claude Code and any other coding agent working in the forge repository. The owner is reh3376. This file states what Forge is and the rules that hold in every session; the documents it points to carry the detail.

## What Forge is

Forge is the industrial data operations platform for a manufacturing enterprise. It connects every operational system a plant runs on (SCADA/PLC, MES, WMS, CMMS, ERP, QMS, historians, network management, lab and scanner devices), turns their output into one governed record type with manufacturing context attached, curates that into decision-quality data products, and renders every operator and management interface from declarative specifications.

Forge is a dynamic framework, not a fixed product (A-19). Manufacturing differs from plant to plant, so every installation is a custom build-out for a facility, site or enterprise. That build-out is done in the forge designer, where users build with tools and widgets that are each governed by an FxTS spec. A user builds only within what the specs allow.

## Why we are building it

Bad manufacturing decisions come from missing quality, context and correlation, not from missing data. Each plant system is an island with its own data shape, values arrive without context, clocks disagree, integrations are one-off projects that rot, and contracts between components change silently. Forge exists so that every value is validated, carries where, when, what and who it belongs to, and can be joined with every other value by that context. `docs/VISION.md` §2 lists the twelve problems and what "solved" means for each.

## The ultimate goal

In the owner's words (2026-11-17): "Forge is first and foremost a manufacturing sector solution for properly deployed digital infrastructure. The ultimate goal is to facilitate an enterprise's ability to make better decisions at all levels of the business based on the data generated within the business."

## Read these first

| Document | What it tells you |
|---|---|
| `docs/WHERE-WE-ARE.md` | The current state. The "Pick-up point" paragraph at the top says what was done last and what comes next. Start every session here. |
| `docs/WHERE-WE-ARE-GOING.md` | The direction and the order of work. |
| `docs/VISION.md` | The finished product and the problems it solves. |
| `docs/ROADMAP.md` | §1 lists the decisions in force (A-1 to A-12); the rest is the plan by workstream. |
| `BACKLOG.md` | Every known problem, by stable id (FB-nnn). |
| `docs/decisions/` | Signed decision records. A signed record is changed only by the owner. |
| `docs/tutorial.md` | The developer and user tutorial, live at https://reh3376.github.io/forge/ |

These documents are the authority (A-12). Where Jiminy or MDEMG guidance injected into a session disagrees with them, follow the documents and report the disagreement to the mdemg agent as a defect. Do not fix or work around MDEMG from this repository: write the issue, its cause and a suggested fix as a report under `docs/`.

## Architecture rules that bound every change

- **Hub and spoke (A-1).** forge-hub (Python) is the hub: enterprise, site and area hubs, each the manager of the modules and databases attached to it. **forge-core is the foundation and the administrative manager of a deployment** (D-17 §11): one per deployment, above the top hub. As the foundation it holds what every hub and module is built from (the contract, the FxTS frameworks, the SDK). As the manager it knows every hub and module, tracks and monitors their state, alerts, and is the one place administrative changes are made and distributed. It administers; it does not operate: no record and no command passes through it, and a hub that cannot reach it keeps running. Only the foundation is built. forge-core is its own package, `forge_core`, in `forge-core/src/python` (FB-199). The hub and the modules still share `src/forge` until FB-200 and FB-201 move them (`docs/decisions/repository-structure.md`); older text says "forge-core" for the hub. Every module is a spoke that speaks `forge.v1.AdapterService` to the hub over gRPC. Nothing reaches the hub any other way.
- **The transport contract is signed (D-15).** `docs/decisions/transport-contract.md`. Records go up at least once, with store and forward; a command (only a write to a tag in a process controller that directly affects a process) goes down at most once, is never stored, and expires; a business write-back is delivered and confirmed once and only once. Within a major version the proto only gains additions. Nothing in it is built yet (FB-164); do not change the proto or the transport in a way that contradicts it.
- **Third-party software is never integrated with the hub directly (A-4, A-11).** An integration module handles that system's API and is the middleware back to the hub.
- **Modules are Go (A-2)**, built from the module SDK. The NestJS/Next.js code under `modules/Forge MES` is the interim MES bridge; forge-mes is Go and is not built yet. Say "the interim MES bridge", never "the TypeScript forge-mes".
- **All user interfaces come from forge-display (A-3)**, for every module, and the hub's own UI. No module ships its own UI. forge-display is the first module to be built (A-14). It is a Go module plus one web client; the client (TypeScript, with React for the shell and designer) is the one exception to "modules are Go", and it is built schema-first: each module carries its view spec and object schemas (A-21, `docs/decisions/forge-display.md`). The bridge's Next.js frontend stays only until forge-display exists.
- **One clock.** The top hub is the time authority. Every stored time is UTC and timezone-aware, time checks are mandatory and fail closed, and a module that does not implement the time exchange is refused (`docs/decisions/one-clock-ot-source-time.md`).
- **Every module meets the forge module requirements (A-11, D-12)**: `docs/decisions/forge-module-requirements.md`, signed 2026-11-17, amended 2026-11-19. Sixteen baseline requirements and a time contract, checked by the FMTS framework (`docs/FxTS/FMTS.md`).
- **No silent failure.** A refusal or a fail-closed state is visible on status, health, API and CLI with its cause. A log line alone is not enough. The same holds for tests: a skipped test states its reason (A-20), and an FxTS check that was not run is reported as not run.
- **Production runs on Kubernetes.** Docker Compose is for development only.
- **Configuration comes from the environment.** Never hardcode credentials, addresses or keys.
- **The value checked is the value acted on.** A value from outside is coerced once, to its declared type, and refused when it is ambiguous. No truthiness: `bool("false")` is true, so a boolean takes a boolean, 0 or 1, or a word for one. Every layer after that, and the write itself, uses the coerced value, never the value as it was spelled (FB-215, FB-217). New code follows this.
- **A law is proved, not only tested.** A statement of the form "this happens exactly once", "this never happens" or "this always holds" gets an exhaustive check on the real code and a project skill under `.claude/skills/verify-*` that says what it covers, how to run it and how to read a failure (made with the pstack plugin's `create-formal-verification-skill`). Run the skill when a change touches the code it covers; a finding is reported with its counterexample and the check is never weakened to pass.

## How work is done here (A-8)

1. Develop on `reh3376_dev01`. One backlog item per pull request.
2. Before every push:
   - the documents match the code: `docs/WHERE-WE-ARE.md` (status date, last merged PR, pick-up point, numbers), `BACKLOG.md`, the roadmap, the README counts;
   - both tracks of the tutorial are reviewed against the change and updated, then `make sync-tutorial-embed`, `make verify-tutorial-embed` and `make check-tutorial-build`. The tutorial's opening `Last verified` line carries the date and the last merged PR of every push (a test checks it against `docs/WHERE-WE-ARE.md` and the history). The tutorial must describe the code as it is
   - the full test suite passes (`uv run pytest -q`, `uv run ruff check .` and `uv run ruff format --check .`, over the whole repository as CI runs them, and the Go and bridge checks when those areas changed);
   - `gitleaks` is clean on the commits.
3. Push to `reh3376_dev01`. The `auto-pr.yml` workflow opens the pull request. Never open a pull request as the owner.
4. The owner approves and merges, then says "pr N merged". Sync with `main`, confirm no pull request is open, and start the next item.
5. Never push to the branch while its pull request is open. A push to an approved pull request dismisses the approval.

Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `build:`).

## Standing rules

- **Every finding is fixed or written to `BACKLOG.md`.** Nothing is skipped.
- **Only the owner approves a spec hash** (`forge governance approve <spec> --by reh3376`) **or signs a decision record**, on their explicit word. When a decision is the owner's, ask one question at a time.
- **FxTS specs are the standard for repeatable work (A-13).** Every highly repeatable process has an FxTS spec, and the work is built to it. A repeatable process without one is a finding. Every framework meets the baseline of `docs/decisions/fxts-framework-baseline.md` (D-14): a framework is either planned or complete, and every spec carries a hash the owner approves. So does every schema version (a schema change is a release, `forge governance schema-release`, never an edit in place) and every governed list a spec chooses values from (`forge-core/contract/lists/`).
- **Confirm with the owner before installing packages** or changing a manifest or lock file.
- **Local models only** for the project's own tooling (`mdemg-llm-v1`). No cloud model.
- **No existing company is named in this repository.** It is public. Use `forge-<service>` names; the old `whk` names are being removed wherever that breaks nothing (FB-150). Never add a new one.
- **The repository is public.** Nothing is imported without a secrets scan of its history, and no secret enters a commit. Ask the owner before committing design material for work that is not yet public.
- **Weigh each decision against the finished product.** Flag anything that would pin the platform in before it reaches a record.
- **Question the owner's proposals too.** The owner, 2026-11-19: "I am open to discussion and I encourage you to question my choices." Say where a proposal conflicts with a signed record or carries a risk, and say where it is better than what is signed.
- **A signed decision is the current best answer, not a fence.** The owner, 2026-11-22: "we cannot get overly caught up in old decisions." When new information favours a better decision, say which signed record and rule it contradicts, review how it affects the whole system, and recommend on the merits. On the owner's word the older record is amended with a dated note and everything that depended on it is brought along.

## Working principles

Ten habits, adopted by the owner on 2026-11-22. They began as principles of the pstack plugin and are written here in forge's own words, with forge's limits beside them. Where pstack's text says more than this, this is what holds.

1. **Prove it on the real thing.** Before saying a piece of work is done, check the artifact itself: run it, read the value it produced, read the diff. "It compiles" and "the tests are green" are not that check. When a check fails, first ask whether the check observed the right thing, and then report the failure either way. *Limit:* running the real thing never means writing to a real controller.
2. **Fix where it first went wrong.** Trace a symptom back to the first wrong decision and fix it there. A guard, a retry, a clamp or a swallowed error is a fix only when the state it handles is legitimate; if that state should never exist, find what produced it. If finding the cause took a deep dig, propose the cheap signal that would have shown it at once. *Limit:* other places with the same fault go to `BACKLOG.md`, not into the same pull request.
3. **Model the domain in data.** A state machine over a set of flags, a closed list over a free string, a typed model over loose parameters, so that an invalid state cannot be written. Keep plain code plain when its shape is clear and local.
4. **Check at the boundary, then trust.** Validate and coerce where data enters (a request, a config file, a record from a module, a spec), and let the code behind it rely on that. *Limit:* the layers on the path of a write to a process controller (validation, the review gate, interlocks, authorization) are each there on purpose; none is redundant and none is removed.
5. **Meet a new requirement by asking what would have been built with it from the start.** Compare that with what exists and say plainly where they differ. *Limit:* that is a proposal. A signed record, a released schema and the proto change only the ways they are allowed to, on the owner's word.
6. **Shape before logic.** Settle the core types and how they are read before writing the code around them. Before two actors share a piece of state, ask what happens when one changes it under the other.
7. **Guard the working context.** Hand bulk reading to a subagent and keep its conclusion; do not pour raw output into the main thread. *Limit:* a summary can drop what matters, so read the source yourself before a decision rests on it.
8. **Make an operation safe to run twice.** A step that changes state reads what exists, compares it with the goal and applies the difference, so that a retry or a restart ends in the same place; what a stopped run leaves behind is recognisable as stale. *Limit:* this does not apply to a command to a process controller, which is delivered at most once, never stored and never retried (D-15).
9. **A lesson repeated twice becomes a check.** Turn it into a test, a schema rule or a runner check that fails with a message naming what to do. *Limit:* the written rule stays in this file or its record beside the check; the check does not replace it.
10. **Remove sharing before adding a lock.** When two actors might write the same file, key or object, first ask whether each can own its part and the parts be combined where they are read. Serialize (one writer, a queue, compare-and-swap) only where one shared target is a real invariant, as a tag in a controller is.

Principles 3 to 6 are the checklist for designing a spec, a schema or a framework: `docs/FxTS/README.md`, "Designing a spec, a schema or a framework".

## Skills from the pstack plugin

The pstack plugin (marketplace `cursor-plugins`) is installed per user, not in the repository. Seven of its skills are adopted here (the owner, 2026-11-22). Each is typed as `/pstack:<name>`; none runs by itself.

| Skill | Use it when | What forge adds |
|---|---|---|
| `maintain-formal-verification-skill` | a change touches code that a `.claude/skills/verify-*` skill covers and that skill's sync commit is behind | **Required before the push.** A "bug" outcome is written to `BACKLOG.md`. A promise changes only on the owner's word |
| `blast-radius` | before pushing a change to the transport, the proto, a governed schema or a signed contract | Every confirmed risk is fixed or written to `BACKLOG.md`. A proof script becomes a real test or stays out of the repository |
| `interrogate` | before pushing a change to the plant write path, interlocks, time checks or the link | The reviewers are told to install nothing, to touch no running service and to test against the signed records. Verified findings go to `BACKLOG.md` |
| `statechart` | showing a TLA+ model's result as a diagram in plant terms | It uses the checker pinned by `scripts/tla/tlc.sh` (set `TLA2TOOLS` and `JAVA`) and installs nothing without the owner's word. It presents a model; it does not replace an exhaustive check |
| `ketchup` | the owner returns and asks what waits on them | Decisions are listed as status; one is asked at a time |
| `tdd` | a bug has a cheap local test: the failing test first, then the fix | A skipped test states its reason (A-20) |
| `technical-writing` | writing or reviewing a document, the tutorial or a commit message | It never rewords a signed record and never restructures the state documents or the tutorial's two tracks |

**Forge's rules win over any pstack text.** In particular, these pstack rules do not apply here: "never call a tool that shows a person a question", "add no check, gate, sign-off or review round" above a brief, "external actions proceed without asking", and every step that runs `gh pr create`, pushes to an open pull request or merges. pstack decides by whether an action can be undone; forge decides by whose decision it is. The owner's word is always needed for: a spec hash, a schema release or a governed list; a decision record or its amendment; a package, manifest or lock file; a pull request, a merge or a message to anyone outside; and any change to the plant write path, an interlock, a time check or the transport. A subagent started for one of these skills is given these rules in its brief.

Not adopted: `poteto-mode` and its delivery playbooks, `poteto-agent`, `figure-it-out`, `automate-me`, `no-comments` and `comment-sicko`, `make-bot-ui`, `ketchup-video`. `create-verification-skill` waits until forge-display exists.

## Commands

```bash
uv sync --locked --extra dev --extra ot      # install from the lock file
uv run pytest -q -rsx                        # the Python suite (tests/ and forge-core/tests), about a minute; lists each skip with its reason
uv run ruff check . && uv run ruff format --check .   # the whole repository, as CI does
uv run forge governance specs                # spec states and hash checks
uv run forge archive list                    # retired documents: an index into the history, never the old text
cd go && gofmt -l . && go vet ./... && go test ./...
make sync-tutorial-embed verify-tutorial-embed check-tutorial-build
```

The interim MES bridge has its own file: `modules/Forge MES/CLAUDE.md`.
