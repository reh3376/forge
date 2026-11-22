# The structure of the repository: forge-core, forge-hub, forge-modules — design record

**Status:** approved by reh3376 on 2026-11-22 as D-17 (the owner answered Q-1 to Q-6 one at a time and signed the record as written, Q-7). Nothing is moved yet: §9 is the plan, and the code is still laid out as §2 describes. · **Backlog:** FB-196 (with FB-197 to FB-203) · **Roadmap:** decision A-1
**Participants:** reh3376 (owner, decides and signs), Claude (surveys, asks, records, proposes)

Every statement is tagged **[OWNER]** (decided by the owner, with the date), **[FACT]** (what the code says today, with where) or **[PROPOSED]** (Claude's recommendation, not approved).

---

## 1. What the owner said (2026-11-22)

**[OWNER]** "I have been thinking thru the hierarchical structure of forge and I'm thinking we may want to better divide up the sections and clean up the overall file structure a little. Here are the layers I am thinking would be most logical (this is only my suggestion, it does not mean it is the best way to do it, we must work together to make that determination). forge-core (this is the core functionality shared by all other components in the forge framework), forge-hub (there are 1 or more hubs for every forge-core deployment), forge-modules (these are the modules associated with a given forge-hub)."

## 2. What exists today (surveyed 2026-11-22)

- **[FACT]** All Python code is one package, `src/forge`: 360 files in 18 sub-packages, defined by one manifest (`pyproject.toml`, `packages = ["src/forge"]`) and one lock file. Tests are a separate tree, `tests/`, that mirrors it.
- **[FACT]** By layer, with the lines of code in each and what it imports from the others:

| Would belong to | Package | Lines | Imports |
|---|---|---|---|
| core | `core` (models, the clock) | 5,300 | nothing |
| core | `proto_gen` | 1,000 | nothing |
| core | `governance` (the FxTS frameworks) | 10,800 | `adapters`, `core`, `ingest`, `modules`, `transport` |
| core | `sdk` (module builder, scripting) | 6,300 | `core` |
| hub | `storage` | 5,100 | `context`, `core`, `curation`, `registry` |
| hub and module | `transport` | 4,700 | `adapters`, `core`, `ingest`, `proto_gen` |
| hub | `curation`, `context`, `registry` | 4,600 | `core` |
| hub | `cli` | 1,700 | `governance`, `storage` |
| hub | `api` | 1,300 | eight other packages |
| hub | `gateway` | 800 | `api`, `storage` |
| hub | `broker`, `ingest`, `observer` | 1,400 | hub packages, `governance` |
| modules | `adapters` (eight modules, four generic adapters, the base class) | 13,000 | `core` |
| modules | `modules/ot` | 20,700 | `adapters`, `core`, `gateway`, `transport` |

- **[FACT]** Two things already fit the split: `core` imports nothing, and the eight adapter modules import only `core`.
- **[FACT]** Five things do not, and are defects under any layout:
  1. `transport` holds both ends of the link, the hub's servicer and the module's client, so it imports hub code and module code.
  2. `governance` imports `adapters`, `modules`, `ingest` and `transport`, mostly through the conformance kit, which runs a module against the real hub servicer.
  3. `gateway` and `api` import each other.
  4. The plant-floor module imports the hub's `gateway`.
  5. `ingest` imports `governance`, and `governance` imports `ingest`.
- **[FACT]** The clutter: two folders named modules (top-level `modules/`, five folders with spaces in their names; and `src/forge/modules`, which holds only the plant-floor module); two words for one thing (`adapters`, `modules`); three proto folders (`src/forge/proto`, `go/proto`, top-level `proto/`); two SDK folders (`sdk/`, `src/forge/sdk`); a folder with the old company prefix (`sidecars/whk-sidecar`, FB-150).
- **[FACT]** The repository tracks 4,815 files; 3,771 are the interim MES bridge under `modules/Forge MES`. The four other folders there (`Forge CMMS`, `Forge ERPI`, `Forge NMS`, `Forge DB Orchestration`, 73 files) are earlier template copies of code that also lives under `src/forge`; nothing imports them and they have drifted (FB-019).
- **[FACT]** All 71 governed files (specs and lists) live under `src/forge/governance/`, whatever they describe. D-14's F-5 requires exactly that: "every spec lives in the framework's `specs/` directory".
- **[FACT]** "forge-core" means the hub today: in A-1, in `CLAUDE.md`, in every signed record, in the hub's view spec (`owner_module: forge-core`), in its seven object schemas (`forge://schemas/forge-core/…`) and in its four view documents (`forge-core-status` and the others).

## 3. Questions and answers

| # | Question | Answer |
|---|---|---|
| Q-1 | What forge-core is. | **Answered 2026-11-22: the shared foundation, not a running thing.** forge-core is what hubs and modules are built from: the contract (proto files, schemas, the FxTS frameworks, governed lists) and shared libraries in Python and Go. It has a version and is never deployed. The hub is forge-hub. An installation is one or more hubs, each with its modules. Debt check: the name changes meaning, so the hub's id and the wording of signed records change once, now, before more is built on the old name. |
| Q-2 | How deep the reorganisation goes. | **Answered 2026-11-22: three top-level folders, each self-contained.** `forge-core/`, `forge-hub/` and `forge-modules/`, each holding its own code, tests and specs; one folder per module. Debt check: a module's folder holds the whole module, which is what "each module carries its own specs and schemas" (D-16) asks; a module can later be lifted out whole. |
| Q-3 | How the Python code is packaged. | **Answered 2026-11-22: one project, three package roots.** One manifest and one lock file at the top; the manifest lists the three places code is found. Imports become `forge_core`, `forge_hub` and one package per module. This is the owner's confirmation for the manifest change this record needs. Debt check: installing, testing and CI stay one command; a module gets a manifest of its own when one is shipped on its own. |
| Q-4 | What happens to the top-level `modules` folder. | **Answered 2026-11-22: remove the four copies; move the bridge under its module.** The four template copies are deleted (history keeps them; FB-019 closes). The interim MES bridge moves to `forge-modules/forge-mes/bridge`. |
| Q-6 | D-14's rule F-5: where a spec lives. | **Answered 2026-11-22: a spec lives with what it describes.** F-5 becomes "every spec lives in the `specs/` folder of what it describes, and is listed; no spec file exists outside such a folder". The listing and checking command walks the three layers. Debt check: seeing one framework's specs side by side needs the command, not a folder. |
| Q-5 | When. | **Answered 2026-11-22: now, before the role model.** A design record with the exact layout for the owner's signature, then the untangling, then the moves layer by layer, then a test that forbids imports in the wrong direction. The role model (FB-189 onward) resumes afterwards in the new layout. |

## 4. The rules of the three layers

**[OWNER]** Signed 2026-11-22.

| # | Rule |
|---|---|
| S-1 | **forge-core imports nothing of the hub or of any module.** It is the contract and what both sides share. |
| S-2 | **forge-hub imports forge-core, and no module.** The hub knows a module only through the contract. |
| S-3 | **A module imports forge-core, and nothing of the hub or of another module.** What a module needs from a hub it gets over the link. |
| S-4 | **A folder holds everything about its subject**: code, tests, specs, object schemas, its part of the documentation. |
| S-5 | **A spec lives with what it describes.** A module's FACTS, FMTS, FVTS and roles specs are in the module's folder; the hub's in the hub's. forge-core holds the frameworks themselves (schema, runner, gate), and specs that describe forge-core itself. |
| S-6 | **One test holds S-1 to S-3** on every run, by reading the imports. An import in a forbidden direction fails the suite. |
| S-7 | **Tests of a module may use the hub's conformance kit**, because proving a module against a real hub is what the kit is for. Module code may not. |

## 5. The target layout

**[OWNER]** Signed 2026-11-22.

```
forge-core/
  contract/
    proto/                    the one set of proto files (today src/forge/proto)
    lists/                    the governed lists (today src/forge/governance/lists)
    fxts/<framework>/schema/  each framework's schema, frozen versions and registry
  python/forge_core/
    models/, clock.py, …      today src/forge/core
    proto_gen/                today src/forge/proto_gen
    fxts/                     the shared runner, the schema and list code, each framework's runner
    adapter/                  the adapter base class a module is built on (today src/forge/adapters/base)
    link/                     the module's side of the link: the client, the time exchange (from src/forge/transport)
    sdk/                      the module builder and the scripting API (today src/forge/sdk)
  go/                         the Go models, generated bindings and scaffold (today go/)
  tests/

forge-hub/
  src/forge_hub/
    api/, gateway/, ingest/, storage/, registry/, context/, curation/, broker/, observer/
    link/                     the hub's side of the link: the servicer (from src/forge/transport)
    conformance/              the conformance kit: a reference hub to run a module against
    cli/                      the `forge` command
  specs/                      the hub's own: the 28 FATS specs, the FTTS spec, its view spec,
                              its object schemas, its four view documents
  tests/

forge-modules/
  forge-ot/                   src/forge_ot/, specs/, manifest, tests/
  forge-wms/, forge-cmms/, forge-nms/, forge-ims/, forge-historian/, forge-scanner/,
  forge-integ-erp-netsuite/   each: src/forge_<name>/, specs/, manifest, tests/
  forge-mes/                  src/forge_mes/, specs/, manifest, tests/, bridge/ (the interim bridge)
  forge-display/              specs/ only for now: the twelve widget specs
  generic/                    the four generic adapters (CSV, MQTT Sparkplug, OPC UA, REST)

docs/, deploy/, scripts/, tests/   stay at the top: tests/ keeps only what spans layers
                                   (documents current, the lock file, proto copies, skips, CI)
```

What moves where, package by package:

| Today | Becomes | Note |
|---|---|---|
| `src/forge/core`, `proto_gen`, `sdk` | `forge-core/python/forge_core/` | |
| `src/forge/governance/shared`, `fhts`, every framework's `schema/` and `runners/` | `forge-core` | the frameworks |
| `src/forge/governance/*/specs/` | the folder of what each spec describes (S-5) | changes D-14 F-5, §7 |
| `src/forge/governance/fmts/conformance.py` | `forge-hub/src/forge_hub/conformance/` | it runs the real hub; the FMTS runner is handed it, and does not import it (S-1) |
| `src/forge/transport` | split: client to `forge_core.link`, servicer to `forge_hub.link` | defect 1 |
| `src/forge/api`, `gateway`, `ingest`, `storage`, `registry`, `context`, `curation`, `broker`, `observer`, `cli` | `forge-hub/src/forge_hub/` | |
| `src/forge/adapters/base` | `forge_core.adapter` | modules are built on it |
| `src/forge/adapters/forge_<x>` | `forge-modules/forge-<x>/src/forge_<x>/` | eight modules |
| `src/forge/adapters/{csv_file,mqtt_sparkplug,opcua,rest_generic}` | `forge-modules/generic/` | |
| `src/forge/modules/ot` | `forge-modules/forge-ot/src/forge_ot/` | |
| `modules/Forge MES` | `forge-modules/forge-mes/bridge/` | Q-4 |
| `modules/Forge CMMS`, `Forge ERPI`, `Forge NMS`, `Forge DB Orchestration` | removed | Q-4 |
| `go/` | `forge-core/go/` | the `forged` and `forgectl` placeholders stay with it until they are something |
| `proto/scanner`, `go/proto/scanner` | `forge-modules/forge-scanner/` | a module's own service |
| `sdk/` (top level) | folded into `forge_core.sdk` | a second copy today |
| `tests/<package>/` | the `tests/` of the layer or module it tests | |
| `sidecars/whk-sidecar` | left for FB-150 | its name is the owner's to give |

## 6. The hub's id

**[OWNER]** Signed 2026-11-22. With Q-1, the hub is `forge-hub` wherever it has an id:

| Today | Becomes |
|---|---|
| `owner_module: forge-core` in the hub's view spec; the file `forge-core.fvts.json` | `forge-hub`; `forge-hub.fvts.json` |
| `forge://schemas/forge-core/<Entity>/v1` (seven object schemas) | `forge://schemas/forge-hub/<Entity>/v1` |
| the view documents `forge-core-status`, `-modules`, `-governance`, `-access` | `forge-hub-status` and the others |

Each of these changes a spec's content, so each is stamped again and put to the owner for approval when that step is done. No spec hash is approved by this record.

## 7. What this changes in records already signed

| Record | Was | Would become |
|---|---|---|
| A-1 (`ROADMAP.md`), `CLAUDE.md` | "forge-core (`src/forge`, Python) is the hub" | forge-hub is the hub; forge-core is the shared foundation hubs and modules are built from |
| D-14, F-5 (`fxts-framework-baseline.md`) | "Every spec lives in the framework's `specs/` directory and is listed. No spec file exists outside it." | every spec lives in the `specs/` folder of what it describes, and is listed; no spec file exists outside such a folder |
| D-16 (`forge-display.md`) | the hub's view spec and screens named `forge-core…` | named `forge-hub…` |
| Every signed record | file paths under `src/forge/…` | unchanged in the record's text; each record gets one dated note that paths were moved by this record, with the mapping of §5 |

A signed record is changed only by the owner. The first three are changes of substance and are the owner's to make by signing this record; the fourth is a note, not an edit of what was decided.

## 8. The signature

| # | Question | Answer |
|---|---|---|
| Q-7 | The layout of §5, the rules of §4, the hub's id of §6 and the changes of §7, as a whole. | **Answered 2026-11-22: signed as written.** |

## 9. Implementation plan

One backlog item and one pull request per step. Every step leaves the full suite, lint, the tutorial build and CI passing.

| Step | What | Item |
|---|---|---|
| 1 | Untangle, in place: split `transport` into its two ends; break the `gateway`/`api` and `ingest`/`governance` cycles; take the hub's `gateway` out of the plant-floor module; hand the conformance kit to the FMTS runner instead of importing it | FB-197 |
| 2 | The import-direction test (S-6), in place, over today's packages grouped by their future layer; it starts strict because step 1 is done | FB-198 |
| 3 | forge-core: move, rename the imports, change the manifest (confirmed by Q-3) | FB-199 |
| 4 | forge-hub: move; the hub's id (§6) and its specs, re-stamped for the owner | FB-200 |
| 5 | forge-modules: one folder per module with its specs and tests; remove the four copies; move the bridge and its CI job | FB-201 |
| 6 | The Go tree, the proto folders, the top-level leftovers | FB-202 |
| 7 | The documents: `CLAUDE.md`, the tutorial's repository tour and both tracks, the README, the dated note in each signed record | FB-203 |
