# forge-core

**forge-core** is the foundation and the administrative manager of a Forge deployment. There is one per deployment, above the top hub.

As the foundation, it holds what every hub and module is built from: the contract, the FxTS frameworks, and the SDK.

As the manager, it knows every hub and module in the deployment, tracks and monitors their state, raises alerts, and is the one place administrative changes are made and distributed.

It administers; it does not operate. No record and no command passes through it, and a hub that cannot reach it keeps running.

This definition is the owner's (2026-11-22). The signed record is [`docs/decisions/repository-structure.md`](../docs/decisions/repository-structure.md), section 11.

## Where forge-core sits

A deployment is run as a chain of command.

| Level | In the chain of command | Manages |
|---|---|---|
| **forge-core** | the chief executive | the whole deployment, through the enterprise hub |
| forge-hub, enterprise | the vice president | the site hubs, and the modules and databases attached to it |
| forge-hub, site | the director | its area hubs, and the modules and databases attached to it |
| forge-hub, area | the plant manager | the modules and databases attached to it |

Each level deals with two things only: what is attached to it, and the one level above it. An area hub never reaches forge-core; it reports to its site hub, which reports to the enterprise hub, which reports to forge-core. State rolls up one level at a time, and administrative changes roll down the same way.

## Administration and operations

The two kinds of work are kept apart, so that a deployment can be administered from one place and still run when that place cannot be reached.

| | Operations | Administration |
|---|---|---|
| Where | every hub | forge-core |
| What | ingest, context, storage, alarms, writes to process controllers, the health of the hub's own modules | the inventory of every hub and module, deployment-wide state and alerting, making and distributing changes (specs, schemas, governed lists, roles, configuration) |
| When the link to forge-core is lost | nothing is lost; the hub keeps running | the hub runs on what it last received; changes wait until the link returns |

## How authority works

Authority comes down the chain of command as limits, and each level decides for itself within them. This is the owner's direction of 2026-11-22 and 23; it is recorded in the signed record's section 11.5, it is not yet signed as a whole, and none of it is built.

- **A behavioral contract comes down from the level above.** It says what a level may decide for itself.
- **A decision within the contract is final when it is made.** It was approved when the contract was. It is reported upward for the record.
- **A decision at or beyond the contract's line is interim.** It is taken because the moment needs it, it carries its reason, and it is in force while it waits for review. Review by the level above ends in `interim.approved` or `interim.rejected`. A rejection stops the decision from then on; it does not undo what was done under it, which stays on record.
- **Some limits are never crossed, even as an interim decision.** They are a governed list the owner approves, [`contract/lists/hard-limits.list.json`](contract/lists/hard-limits.list.json). The list is meant to change: a limit is added or retired by one approved change.

So a hub that is cut off does not wait for permission to keep its plant running, and what it decided alone is seen and judged when the link returns.

## What is built

| Part | State | Where |
|---|---|---|
| The foundation: models and the one clock | built | [`src/python/forge_core`](src/python/forge_core) |
| The foundation: the contract (proto files; every framework's schema with its released versions; the governed lists and their schema) | built | [`contract/`](contract) |
| The foundation: the FxTS frameworks (runners, the shared runner, the hash framework) | built | [`src/python/forge_core/fxts`](src/python/forge_core/fxts) |
| The foundation: the SDK (module builder, scripting) | built | [`src/python/forge_core/sdk`](src/python/forge_core/sdk) |
| The foundation: the adapter base class and the generic adapters; a module's end of the link to a hub | built | [`src/python/forge_core/adapter`](src/python/forge_core/adapter), [`src/python/forge_core/link`](src/python/forge_core/link) |
| The foundation in Go (models, generated bindings, the module scaffold) | built | [`src/go`](src/go) |
| The foundation's own tests | built | [`tests/`](tests); some framework tests are still under [`../tests/governance`](../tests/governance) |
| **The manager** | **not built** | no inventory, no deployment-wide state, no distribution of changes, no behavioral contract, no review of interim decisions |

Still to be decided for the manager: where it runs, and whether the time authority stays with the top hub. These are among C-1 to C-7 in the record. The manager is tracked as FB-232 and the authority model as FB-233 in [`BACKLOG.md`](../BACKLOG.md).

## The rules forge-core is held to

- **The foundation imports nothing of a hub or a module.** A hub imports the foundation; a module imports the foundation and nothing of a hub or another module. [`tests/test_layer_imports.py`](../tests/test_layer_imports.py) fails on an import in the wrong direction.
- **The contract is language-neutral and lives outside the Python package.** `forge_core.contract` says where it is; a built package and the container image carry it. A released schema version is never edited; a change is a release the owner approves.
- **Every governed file says which construction it is.** A spec and a governed list each declare the version of the format they are written in and record the schema they were checked against. A receiver that does not know the version refuses the file and says so.
- **The proto only gains additions within a major version.** The Go tree and the interim MES bridge keep copies, held equal by [`tests/test_proto_copies.py`](../tests/test_proto_copies.py).

## Where to read more

| For | Read |
|---|---|
| The current state of the whole repository and what comes next | [`docs/WHERE-WE-ARE.md`](../docs/WHERE-WE-ARE.md) |
| Why Forge exists and what the finished product is | [`docs/VISION.md`](../docs/VISION.md) |
| The structure of the repository and this definition | [`docs/decisions/repository-structure.md`](../docs/decisions/repository-structure.md) |
| The link between a module and a hub, and between hubs | [`docs/decisions/transport-contract.md`](../docs/decisions/transport-contract.md) |
| What every module must meet | [`docs/decisions/forge-module-requirements.md`](../docs/decisions/forge-module-requirements.md) |
| Roles, and where they are mastered | [`docs/decisions/roles.md`](../docs/decisions/roles.md) |
| One clock | [`docs/decisions/one-clock-ot-source-time.md`](../docs/decisions/one-clock-ot-source-time.md) |
| The FxTS frameworks, and how to design a spec or a schema | [`forge-core/docs/fxts/README.md`](docs/fxts/README.md) |
| Every known problem and what is planned | [`BACKLOG.md`](../BACKLOG.md) |
| The rules every change is held to | [`CLAUDE.md`](../CLAUDE.md) |
