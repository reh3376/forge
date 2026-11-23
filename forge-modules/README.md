# forge-modules

**One folder per module.** A module is anything that registers with a hub: it speaks `forge.v1.AdapterService` to its hub over gRPC and reaches it no other way. Each module is self-contained: it imports forge-core and nothing of the hub or of another module (D-17, S-3; `tests/test_layer_imports.py` holds it).

This page is orientation. The state of each module is in [`../docs/WHERE-WE-ARE.md`](../docs/WHERE-WE-ARE.md); what every module must meet is [`../docs/decisions/forge-module-requirements.md`](../docs/decisions/forge-module-requirements.md).

## What a module's folder holds

| Path | Holds |
|---|---|
| `src/python/forge_<name>/` | The module's Python package, with its `manifest.json`. The package is named after the folder: `forge-wms` holds `forge_wms` |
| `fxts/<framework>/` | The module's own specs: its adapter spec (`facts`), its module spec (`fmts`), and, where it has screens, its view spec (`fvts`) and view documents (`futs`). A spec lives with what it describes |
| `tests/`, `docs/`, `README.md` | Not here yet: the modules' tests are still in [`../tests`](../tests) and their documents in [`../docs`](../docs) (the next steps of FB-201) |

## The modules

| Folder | What it is |
|---|---|
| [`forge-ot`](forge-ot) | The plant-floor module: OPC UA, the tag engine, ISA-18.2 alarms, governed writes to controllers, MQTT, scripting. The hub still hosts it in its own process (FB-204) |
| [`forge-wms`](forge-wms), [`forge-mes`](forge-mes), [`forge-cmms`](forge-cmms), [`forge-nms`](forge-nms), [`forge-ims`](forge-ims), [`forge-historian`](forge-historian), [`forge-scanner`](forge-scanner), [`forge-integ-erp-netsuite`](forge-integ-erp-netsuite) | Python reference adapters. The modules themselves are to be Go, built from the module SDK (A-2) |
| [`forge-mes/bridge`](forge-mes/bridge) | The interim MES bridge (NestJS and Next.js), kept running until the Go forge-mes replaces it. It has its own [`CLAUDE.md`](forge-mes/bridge/CLAUDE.md) and its own CI job, and it is left out of the hub's image |
| [`forge-display`](forge-display) | Only its specs so far: the twelve widget specs. forge-display is the first module that will be built (A-14) |

## Adding a module

`forge module init <module-id> --protocol … --tier …` writes a module in this structure: the package, its tests and its adapter spec, each in the module's own folder. The package is then added to the project manifest (`pyproject.toml`, with the owner's word) so the hub's image and the suite can import it. [`../forge-core/docs/module-builder.md`](../forge-core/docs/module-builder.md) has the detail.
