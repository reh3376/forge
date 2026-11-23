# forge-hub

**forge-hub is the hub of a Forge deployment.** It takes in records from the modules attached to it over the link, adds context, stores, curates, governs and serves that data, and manages those modules and its own databases. There are enterprise, site and area hubs; each deals with what is attached to it and with the one level above it ([`../forge-core/README.md`](../forge-core/README.md) has the chain of command).

This page is orientation. The state of each part is in [`../docs/WHERE-WE-ARE.md`](../docs/WHERE-WE-ARE.md).

## What is here

| Path | Holds |
|---|---|
| [`docs/`](docs) | The hub's documents: [`database-orchestration-framework.md`](docs/database-orchestration-framework.md) (how the hub takes over a module's database: observe, shadow, own) and [`clock-discipline.md`](docs/clock-discipline.md) (what a deployment must provide for the one clock) |
| [`fxts/`](fxts) | The hub's own governed files, one folder per framework, and their generated index ([`fxts/README.md`](fxts/README.md), by `forge governance index`). `fats/` (the 28 specs of the hub's API), `ftts/` (the transport spec), `fvts/` (the hub's view spec, `forge-hub.fvts.json`, and its seven object schemas) and `futs/` (the four screens) |
| [`tests/`](tests) | The hub's tests, one folder per package (`link` for the hub's end of the transport). Helpers shared with forge-core's tests are at the root: `tests/tls.py`, `tests/samples.py`, `tests/otel.py` |
| [`src/python/forge_hub`](src/python/forge_hub) | The hub's package: `link` (the hub's end of `forge.v1.AdapterService`), `ingest`, `context`, `storage` (the engines and the migrations), `registry`, `curation`, `broker`, `api` and `gateway` (the REST API and its auth), `observer`, `cli` (the `forge` command), and `conformance` (the kit that runs a module against a real hub) |

## What is not here, on purpose

| Elsewhere | Why |
|---|---|
| Two tests that run the hub together with a module's code, in [`../tests`](../tests) | they span layers and stay at the root |
| The frameworks, their schemas and the governed lists | they are forge-core's: [`../forge-core`](../forge-core) |
| The signed decision records and the state documents | they stay together at the root: [`../docs`](../docs) |

## Rules

- The hub imports forge-core and no module (D-17, S-2). `tests/test_layer_imports.py` holds this; the one named exception is that the hub still hosts forge-ot in its own process (FB-204).
- A module reaches the hub only over the link. Third-party software never reaches it directly.
- The hub operates; forge-core administers. A hub that cannot reach forge-core, or the hub above it, keeps running.
