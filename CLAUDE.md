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

- **Hub and spoke (A-1).** forge-core (`src/forge`, Python) is the hub. Every module is a spoke that speaks `forge.v1.AdapterService` to the hub over gRPC. Nothing reaches the hub any other way.
- **The transport contract is signed (D-15).** `docs/decisions/transport-contract.md`. Records go up at least once, with store and forward; commands go down at most once, are never stored, and expire. Within a major version the proto only gains additions. Nothing in it is built yet (FB-164); do not change the proto or the transport in a way that contradicts it.
- **Third-party software is never integrated with the hub directly (A-4, A-11).** An integration module handles that system's API and is the middleware back to the hub.
- **Modules are Go (A-2)**, built from the module SDK. The NestJS/Next.js code under `modules/Forge MES` is the interim MES bridge; forge-mes is Go and is not built yet. Say "the interim MES bridge", never "the TypeScript forge-mes".
- **All user interfaces come from forge-display (A-3)**, for every module, and the hub's own UI. No module ships its own UI. forge-display is the first module to be built (A-14). The bridge's Next.js frontend stays only until forge-display exists.
- **One clock.** The top hub is the time authority. Every stored time is UTC and timezone-aware, time checks are mandatory and fail closed, and a module that does not implement the time exchange is refused (`docs/decisions/one-clock-ot-source-time.md`).
- **Every module meets the forge module requirements (A-11, D-12)**: `docs/decisions/forge-module-requirements.md`, signed 2026-11-17. Eleven baseline requirements and a time contract, checked by the FMTS framework (`docs/FxTS/FMTS.md`).
- **No silent failure.** A refusal or a fail-closed state is visible on status, health, API and CLI with its cause. A log line alone is not enough. The same holds for tests: a skipped test states its reason (A-20), and an FxTS check that was not run is reported as not run.
- **Production runs on Kubernetes.** Docker Compose is for development only.
- **Configuration comes from the environment.** Never hardcode credentials, addresses or keys.

## How work is done here (A-8)

1. Develop on `reh3376_dev01`. One backlog item per pull request.
2. Before every push:
   - the documents match the code: `docs/WHERE-WE-ARE.md` (status date, last merged PR, pick-up point, numbers), `BACKLOG.md`, the roadmap, the README counts;
   - both tracks of the tutorial are reviewed against the change and updated, then `make sync-tutorial-embed`, `make verify-tutorial-embed` and `make check-tutorial-build`. The tutorial must describe the code as it is;
   - the full test suite passes (`uv run pytest tests -q`, `uv run ruff check .` and `uv run ruff format --check .`, over the whole repository as CI runs them, and the Go and bridge checks when those areas changed);
   - `gitleaks` is clean on the commits.
3. Push to `reh3376_dev01`. The `auto-pr.yml` workflow opens the pull request. Never open a pull request as the owner.
4. The owner approves and merges, then says "pr N merged". Sync with `main`, confirm no pull request is open, and start the next item.
5. Never push to the branch while its pull request is open. A push to an approved pull request dismisses the approval.

Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `build:`).

## Standing rules

- **Every finding is fixed or written to `BACKLOG.md`.** Nothing is skipped.
- **Only the owner approves a spec hash** (`forge governance approve <spec> --by reh3376`) **or signs a decision record**, on their explicit word. When a decision is the owner's, ask one question at a time.
- **FxTS specs are the standard for repeatable work (A-13).** Every highly repeatable process has an FxTS spec, and the work is built to it. A repeatable process without one is a finding. Every framework meets the baseline of `docs/decisions/fxts-framework-baseline.md` (D-14): a framework is either planned or complete, and every spec carries a hash the owner approves.
- **Confirm with the owner before installing packages** or changing a manifest or lock file.
- **Local models only** for the project's own tooling (`mdemg-llm-v1`). No cloud model.
- **No existing company is named in this repository.** It is public. Use `forge-<service>` names; the old `whk` names are being removed wherever that breaks nothing (FB-150). Never add a new one.
- **The repository is public.** Nothing is imported without a secrets scan of its history, and no secret enters a commit. Ask the owner before committing design material for work that is not yet public.
- **Weigh each decision against the finished product.** Flag anything that would pin the platform in before it reaches a record.

## Commands

```bash
uv sync --locked --extra dev --extra ot      # install from the lock file
uv run pytest tests -q -rsx                  # the Python suite, about a minute; lists each skip with its reason
uv run ruff check . && uv run ruff format --check .   # the whole repository, as CI does
uv run forge governance specs                # spec states and hash checks
cd go && gofmt -l . && go vet ./... && go test ./...
make sync-tutorial-embed verify-tutorial-embed check-tutorial-build
```

The interim MES bridge has its own file: `modules/Forge MES/CLAUDE.md`.
