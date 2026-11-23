# forge-hub

**forge-hub is the hub of a Forge deployment.** It takes in records from the modules attached to it over the link, adds context, stores, curates, governs and serves that data, and manages those modules and its own databases. There are enterprise, site and area hubs; each deals with what is attached to it and with the one level above it ([`../forge-core/README.md`](../forge-core/README.md) has the chain of command).

This page is orientation. The state of each part is in [`../docs/WHERE-WE-ARE.md`](../docs/WHERE-WE-ARE.md).

## What is here

| Path | Holds |
|---|---|
| [`tests/`](tests) | The hub's tests, one folder per package (`link` for the hub's end of the transport). Helpers shared with forge-core's tests are at the root: `tests/tls.py`, `tests/samples.py`, `tests/otel.py` |
| [`src/python/forge_hub`](src/python/forge_hub) | The hub's package: `link` (the hub's end of `forge.v1.AdapterService`), `ingest`, `context`, `storage` (the engines and the migrations), `registry`, `curation`, `broker`, `api` and `gateway` (the REST API and its auth), `observer`, `cli` (the `forge` command), and `conformance` (the kit that runs a module against a real hub) |

## What is not here yet

| Still elsewhere | Until |
|---|---|
| Two tests that run the hub together with a module's code, in [`../tests`](../tests) | they span layers and stay at the root |
| The hub's own specs (the API specs, the transport spec, its view spec, object schemas and view documents), in forge-core's `fxts` folders; and the hub's id, which those files still give as `forge-core` | the step of FB-200 that renames the id; each file is stamped again and approved by the owner |
| `docs/` and `fxts/` | the same steps |

## Rules

- The hub imports forge-core and no module (D-17, S-2). `tests/test_layer_imports.py` holds this; the one named exception is that the hub still hosts forge-ot in its own process (FB-204).
- A module reaches the hub only over the link. Third-party software never reaches it directly.
- The hub operates; forge-core administers. A hub that cannot reach forge-core, or the hub above it, keeps running.
