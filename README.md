# Forge

**Forge is the industrial data operations platform for a manufacturing enterprise.** It connects the operational systems a plant runs on (SCADA and PLCs, MES, WMS, CMMS, ERP, QMS, historians, network management, lab and scanner devices), turns their output into one governed record type with manufacturing context attached, curates that into decision-quality data products, and renders every operator and management interface from declarative specifications.

The goal, in the owner's words: "Forge is first and foremost a manufacturing sector solution for properly deployed digital infrastructure. The ultimate goal is to facilitate an enterprise's ability to make better decisions at all levels of the business based on the data generated within the business."

**Start here:** [Where we are](docs/WHERE-WE-ARE.md) · [Where we are going](docs/WHERE-WE-ARE-GOING.md) · [What Forge will be](docs/VISION.md) · [Roadmap](docs/ROADMAP.md) · [Backlog](BACKLOG.md) · [Tutorial](https://reh3376.github.io/forge/)

This page is orientation. It says what Forge is and where things are, and it links down for detail. Counts, versions and the state of each component live in [`docs/WHERE-WE-ARE.md`](docs/WHERE-WE-ARE.md), which is brought up to date before every push.

---

## Why Forge exists

Bad decisions in manufacturing do not come from a lack of data. They come from a lack of data quality, context and correlation. Each plant system is an island with its own data shape. Values arrive without context, clocks disagree, integrations are one-off projects that rot, and contracts between components change silently.

Forge exists so that every value is validated, carries where, when, what and who it belongs to, and can be joined with every other value by that context. [`docs/VISION.md`](docs/VISION.md) lists the twelve problems and what "solved" means for each.

Forge is a framework, not a fixed product. Manufacturing differs from plant to plant, so every installation is a build-out for one facility, site or enterprise, made from tools and widgets that are each governed by a specification.

## How a deployment is organised

A deployment is run as a chain of command. Each level deals with what is attached to it and with the one level above it, and nothing else.

```
                      forge-core
        the foundation and the administrative manager
                          │
                 forge-hub (enterprise)
                          │
            ┌─────────────┴─────────────┐
     forge-hub (site)             forge-hub (site)
            │                           │
     ┌──────┴──────┐                    │
 forge-hub      forge-hub           forge-hub
  (area)         (area)              (area)
     │              │                   │
  modules        modules             modules

  Every hub also has its own modules and databases attached to it.
```

| Part | What it is |
|---|---|
| **forge-core** | The foundation every hub and module is built from (the contract, the FxTS frameworks, the SDK), and the administrative manager of a deployment. It administers; it does not operate. No record and no command passes through it, and a hub that cannot reach it keeps running. See [`forge-core/README.md`](forge-core/README.md). |
| **forge-hub** | The hub: it takes in records, adds context, stores, curates, governs and serves the data of what is attached to it. There are enterprise, site and area hubs, and a deployment with one site has only a site hub. |
| **Module** | Anything that registers with a hub. A module speaks `forge.v1.AdapterService` to its hub over gRPC and reaches it no other way. A *management module* is Forge's own application for a domain (forge-ot, forge-mes, forge-wms and others). An *integration module* is the middleware between a hub and one third-party system; third-party software never reaches a hub directly. |
| **forge-display** | The module that renders every user interface, for every module and for the hub, from specifications each module carries. No module ships its own interface. |

State moves up the chain one level at a time, and administrative changes move down the same way. Records travel up at least once, with store and forward. A command to a process controller travels down at most once, is never stored, and expires.

## What is built, and what is not

This is the short form. [`docs/WHERE-WE-ARE.md`](docs/WHERE-WE-ARE.md) has every component.

| Built | Where |
|---|---|
| forge-core's foundation: the models, the one clock, the contract, the FxTS frameworks, the SDK | [`forge-core/`](forge-core) |
| The hub: the gRPC transport, ingest, context, storage, schema registry, curation, the REST API, the `forge` command | [`src/forge/`](src/forge) |
| forge-ot, the plant-floor module: OPC UA, the tag engine, ISA-18.2 alarms, governed writes to controllers, MQTT, scripting | [`src/forge/modules/ot/`](src/forge/modules/ot) |
| Eight adapters for other systems, as Python reference implementations | [`src/forge/adapters/`](src/forge/adapters) |
| Six FxTS frameworks with their specs, and the governed lists, each hashed and approved by the owner | [`forge-core/contract/`](forge-core/contract), [`forge-core/src/python/forge_core/fxts/`](forge-core/src/python/forge_core/fxts) |
| Exhaustive checks of two laws of forge-ot, each with a project skill | [`.claude/skills/`](.claude/skills) |
| The interim MES bridge, kept running until the Go forge-mes replaces it | [`modules/Forge MES/`](modules/Forge%20MES) |

| Not built yet | Tracked as |
|---|---|
| forge-core's manager, and the authority model of the chain of command | FB-232, FB-233 |
| Hub-to-hub links, and the transport contract's store and forward, expiring commands and write-backs | FB-164 |
| forge-display and its designer | FB-181, FB-184 |
| The role model in force on the hub | FB-075, FB-189 to FB-195 |
| The management modules in Go, built from the module SDK | FB-017, FB-076 |
| The low-code builder for integration modules | FB-154 |

## Where things are

The repository is being reorganised into three self-contained parts, forge-core, forge-hub and forge-modules, each with the same standard folders ([`docs/decisions/repository-structure.md`](docs/decisions/repository-structure.md)). forge-core has moved. The hub and the modules still share `src/forge` until their own moves.

| Path | Holds |
|---|---|
| [`forge-core/`](forge-core) | The foundation: `contract/` (proto files, framework schemas, governed lists), `src/python/forge_core` (the package), `tests/`, and its own README |
| [`src/forge/`](src/forge) | The hub and the modules, until they move: `api`, `gateway`, `ingest`, `storage`, `registry`, `context`, `curation`, `broker`, `transport`, `cli`; `adapters/`; `modules/ot` |
| [`tests/`](tests) | Tests of the hub and the modules, and tests that span layers |
| [`go/`](go) | The Go models, the generated bindings and the module scaffold |
| [`modules/Forge MES/`](modules/Forge%20MES) | The interim MES bridge (NestJS and Next.js). It has its own [`CLAUDE.md`](modules/Forge%20MES/CLAUDE.md) |
| [`docs/`](docs) | The state and direction documents, the signed decision records, the framework pages, the tutorial's source |
| [`deploy/`](deploy) | The container image and the Compose stack. Compose is for development only; production runs on Kubernetes |
| [`scripts/`](scripts) | The tutorial tools, the pinned TLA+ model checker, the restructuring scripts |
| [`archive/`](archive) | An index of what was retired from the tree. The old content is not kept; `forge archive show <id>` reads it from history |
| [`.claude/skills/`](.claude/skills) | Project skills for coding agents, including the `verify-*` skills that check laws |

## The rules every change is held to

These are the short forms. [`CLAUDE.md`](CLAUDE.md) states them in full and [`docs/ROADMAP.md`](docs/ROADMAP.md) §1 lists the decisions in force.

- **Hub and spoke.** Every module speaks one contract to its hub over gRPC. Nothing reaches a hub any other way.
- **The transport contract is signed.** Records up at least once; commands down at most once and never stored; a business write-back delivered once and only once. The proto only gains additions within a major version.
- **One clock.** The top hub is the time authority. Every stored time is UTC, time checks fail closed, and a module that does not implement the time exchange is refused.
- **No silent failure.** A refusal or a fail-closed state is visible with its cause. A skipped test states its reason, and a check that was not run is reported as not run.
- **Specifications first.** Repeatable work is built to an FxTS spec. Every spec, schema version and governed list carries a hash that only the owner approves.
- **The value checked is the value acted on.** A value from outside is coerced once to its declared type, refused when ambiguous, and the coerced value is what is used.
- **A law is proved, not only tested.** A statement of the form "exactly once", "never" or "always" gets an exhaustive check on the real code.
- **Configuration comes from the environment.** No credentials, addresses or keys in the code. The repository is public and names no existing company.

## Governance: FxTS

FxTS is specification-first governance. A spec says what must exist, and the code is built to it. Each framework has a schema with released versions, a runner, a gate in CI, and specs. A run fails when a spec's hash does not verify or the owner has not approved it. What every framework must provide is [`docs/decisions/fxts-framework-baseline.md`](docs/decisions/fxts-framework-baseline.md), and how to design a spec is in [`forge-core/docs/fxts/README.md`](forge-core/docs/fxts/README.md).

| Framework | Governs | State |
|---|---|---|
| **FACTS** | A module's adapter: identity, capabilities, connection, data contract, context mapping, time | built |
| **FATS** | The hub's API: routes, shapes, status codes | built |
| **FTTS** | The transport: TLS, tokens, streaming behaviour | built |
| **FMTS** | What every module must meet: the sixteen requirements and the time contract | built |
| **FVTS** | The contract between a module and the display: points, objects, alarms, actions, surfaces | built |
| **FUTS** | Widgets and view documents | built |
| **FHTS** | The hash and the owner's approval of every governed file | built, in the shared runner |
| FSTS · FQTS · FDTS · FLTS · FNTS · FOTS · FPTS | Security · data quality · schema evolution · lineage · normalization · observability · performance | planned |

```bash
uv run forge governance specs             # every governed file: its state, its hash, who approved it
uv run forge governance specs --pending   # what awaits the owner
uv run forge governance schemas           # every schema version and how many specs are written against it
uv run forge governance run facts <id>    # run one framework's checks on one spec
```

## Development

### Prerequisites

- Python 3.12 or newer, and [uv](https://docs.astral.sh/uv/)
- Go, for the tree under `go/`
- Node, only for the interim MES bridge (20 or newer) and the tutorial build (22 or newer)
- Docker, for the development stack and the image
- Java 11 or newer, only to run the TLA+ model checker

### Quick start

```bash
git clone https://github.com/reh3376/forge.git
cd forge

# Install from the lock file (dev and ot extras); the same command CI and the image run
uv sync --locked --extra dev --extra ot

# The whole Python suite: tests/ and forge-core/tests, about a minute
uv run pytest -q -rsx

# Lint and format checks; both block CI
uv run ruff check .
uv run ruff format --check .

# The Go tree
cd go && gofmt -l . && go vet ./... && go test ./...
```

Run one area:

```bash
uv run pytest tests/modules/ot -q                 # forge-ot
uv run pytest forge-core/tests -q                 # forge-core
uv run pytest tests/modules/ot/control/test_review_gate_exhaustive.py -q    # the write review gate, exhaustively
uv run pytest tests/modules/ot/alarming/test_state_machine_exhaustive.py -q # the alarm state machine, exhaustively
scripts/tla/tlc.sh <Model.tla>                    # the TLA+ model checker, pinned by checksum
```

### Dependencies

`uv.lock` pins every Python dependency for every platform. CI, the image (`deploy/docker/Dockerfile.forge`) and the quick start all install from it with `uv sync --locked`, which fails when `pyproject.toml` and the lock disagree. A dependency moves only through a committed re-lock, and a change to a manifest or lock file is confirmed with the owner first.

```bash
uv lock --upgrade-package fastapi    # one package, within its range in pyproject.toml
uv sync --locked --extra dev --extra ot && uv run pytest -q   # then commit uv.lock with the change
```

### How work is done

Work happens on the branch `reh3376_dev01`, one backlog item per pull request. A push opens the pull request through a workflow; the owner approves and merges. Before every push the documents match the code, the tutorial is rebuilt, the full suite passes and the commits are scanned for secrets. [`CLAUDE.md`](CLAUDE.md) has the full procedure.

### Tutorial

The tutorial has two tracks, one for developers and one for users, built from [`docs/tutorial.md`](docs/tutorial.md). It is published at https://reh3376.github.io/forge/.

```bash
(cd scripts/tutorial-forge && npm ci)   # once
make sync-tutorial-embed                # build it
make verify-tutorial-embed              # the build matches its sources
make check-tutorial-build               # its verification contracts and every link
```

## Documentation

| Document | What it tells you |
|---|---|
| [`docs/WHERE-WE-ARE.md`](docs/WHERE-WE-ARE.md) | The current state of every component. The pick-up point at the top says what was done last and what comes next |
| [`docs/WHERE-WE-ARE-GOING.md`](docs/WHERE-WE-ARE-GOING.md) | The direction and the order of work |
| [`docs/VISION.md`](docs/VISION.md) | The finished product and the problems it solves |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | The decisions in force, and the plan by workstream |
| [`BACKLOG.md`](BACKLOG.md) | Every known problem, by a stable id (FB-nnn) |
| [`docs/decisions/`](docs/decisions) | The signed decision records. A signed record is changed only by the owner |
| [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) | Design principles and technology decisions |
| [`forge-core/docs/fxts/`](forge-core/docs/fxts) | A page per framework, and the summary |
| [`forge-core/README.md`](forge-core/README.md) | What forge-core is, the chain of command, and how authority works |
| [`CLAUDE.md`](CLAUDE.md) | The rules for anyone, person or agent, changing this repository |
| [`SECURITY.md`](SECURITY.md) | How to report a security problem |

---

Python 3.12+ · Go · gRPC and Protobuf · PostgreSQL, TimescaleDB, Neo4j, Redis · Proprietary; the licence model is undecided ([`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) §6).
