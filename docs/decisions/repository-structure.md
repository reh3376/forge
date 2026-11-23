# The structure of the repository: forge-core, forge-hub, forge-modules — design record

**Status:** approved by reh3376 on 2026-11-22 as D-17, amended the same day by §10 (one standard structure in every major directory), which replaces §5 where they differ, and by §11 (what forge-core is), which replaces the answer to Q-1. Signed as D-17 (the owner answered Q-1 to Q-6 one at a time and signed the record as written, Q-7). Nothing is moved yet: §9 is the plan, and the code is still laid out as §2 describes. · **Backlog:** FB-196 (with FB-197 to FB-203) · **Roadmap:** decision A-1
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
| Q-1 | What forge-core is. | **Amended 2026-11-22 by §11: forge-core is the foundation and the administrative manager of a deployment, one per deployment above the top hub.** As first recorded: **the shared foundation, not a running thing.** forge-core is what hubs and modules are built from: the contract (proto files, schemas, the FxTS frameworks, governed lists) and shared libraries in Python and Go. It has a version and is never deployed. The hub is forge-hub. An installation is one or more hubs, each with its modules. Debt check: the name changes meaning, so the hub's id and the wording of signed records change once, now, before more is built on the old name. |
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

Added by §10, in this order around the steps above: the clean-up of what belongs to no layer, before step 3 (FB-207: the removals of U-2 to U-4, `docs/personal/` ignored, the process-control context note beside D-11); with each move, that layer's `docs/`, `fxts/` and `README.md`; after step 6, the generated indexes with their command and test (FB-208) and the test that holds the structure (FB-209).

---

## 10. Amendment 1: one standard structure in every major directory

**Status of this section:** approved by reh3376 on 2026-11-22 (A-1 to A-3 and U-1 to U-6 answered one at a time; the section signed as written). Where this section and §5 disagree, this section replaces §5: `fxts/` for `specs/`, `src/python` and `src/go` inside forge-core, a `docs/` in every major directory, the generic adapters in forge-core. Nothing is moved yet. Backlog: FB-206, built by FB-207 to FB-209 and the moves of §9.

### 10.1 What the owner said (2026-11-22)

**[OWNER]** "Each major directory (forge, forge-core, forge-hub, & forge-module) will have a standard directory structure; there can be directories in one dir and not in the others but there will be several directories in each of the core directories that are the same for each. […] each should have a docs directory and docs with a global scope should remain in the ~/forge directory, just as forge-hub scoped documents should be held in the ~/forge/forge-hub directory. […] This is only a single example of potentially 100s of such decisions that must be methodically walked through."

This contradicts §5, which keeps `docs/`, `deploy/`, `scripts/` and `tests/` only at the top, and names the spec folder `specs/`.

### 10.2 Decided

| # | Decision |
|---|---|
| A-1 | **[OWNER]** All signed decision records stay together at the root (`docs/decisions/`), whatever layer they mostly concern. A record is found by its number. |
| A-2 | **[OWNER]** A document that exists at more than one level is **written once, at the bottom, and generated above, held by a test.** The lowest level carries the full detail; each level above is a summary built from it by a command; a stale generated file fails the suite. Hand-written text at an upper level is orientation only: it links down and carries no counts, versions or lists. |
| A-3 | **[OWNER]** The folder of governed files in each major directory is named `fxts/` (not `specs/`). It holds that directory's specs and its generated index. The root `fxts/` holds the overview of every framework and every spec, generated from the levels below. |

| A-4 | **[OWNER]** 2026-11-22, after the signature: each major directory has an **`archive/`**, and it is an **index only**. A retired document is removed from the tree and gets a row: a name by its original intent, what it was for, when and why it was retired, what replaced it, and the commit and paths that still hold it. `forge archive show <id>` reads it from the history; a test fails when a row points at nothing, when a retired path is back in the tree, or when the generated page is stale. The owner had proposed keeping the old versions in the folder; the index was chosen because content kept in the tree is read as current by search, agents and memory tools, and old text breaks current rules (names). Superseded versions of governed things stay as files, as before (schema versions; signed records amended in place). The 23 files removed by FB-207 are the first rows of the root archive (FB-210). |

### 10.3 The standard structure

**[OWNER]** Signed 2026-11-22. A major directory is the root, `forge-core`, `forge-hub` and each folder under `forge-modules/`.

| Entry | In every major directory | Holds |
|---|---|---|
| `README.md` | required | what the directory is and its scope; orientation only (A-2) |
| `docs/` | required | documents whose scope is this directory and nothing wider |
| `fxts/` | required | its governed files and their generated index (A-3) |
| `src/` | required below the root | its code; one folder per language where there are two (`src/python`, `src/go`) |
| `tests/` | required | its tests; at the root, only tests that span layers |
| `deploy/`, `scripts/` | where needed | deployment files and tools of this scope |
| `archive/` | when the first document is retired there | `archive.json`, the index of what was retired from this directory, and its generated `README.md`; never the old content (A-4) |
| `contract/` | forge-core only | proto files, framework schemas, governed lists |
| `bridge/` | forge-mes only | the interim MES bridge, until it is retired |

Only at the root: `CLAUDE.md`, `BACKLOG.md`, `SECURITY.md`, `.github/`, the manifest and lock file, the `Makefile`.

### 10.4 Placement rules

**[OWNER]** Signed 2026-11-22. Applied in order; the first that matches decides.

| # | Rule |
|---|---|
| P-1 | A signed decision record: root `docs/decisions/` (A-1). |
| P-2 | A file about exactly one module: that module's folder. |
| P-3 | A file about the hub and no module: `forge-hub`. |
| P-4 | A file about what hubs and modules share (the contract, the frameworks, the SDK, the shared models): `forge-core`. |
| P-5 | A file that spans layers (vision, roadmap, state, tutorial, backlog, CI, cross-layer tests): the root. |
| P-6 | A file that is none of these (a one-time artefact, a leftover, a personal note): it is not placed; it is put to the owner (§10.6). |

### 10.5 The mapping

**[OWNER]** Signed 2026-11-22. Every tracked path outside the interim bridge (which moves whole, Q-4). Counts are tracked files on 2026-11-22.

**Documents**

| Today | Files | Goes to | Rule |
|---|---|---|---|
| `docs/VISION.md`, `ROADMAP.md`, `WHERE-WE-ARE.md`, `WHERE-WE-ARE-GOING.md`, `PRINCIPLES.md`, `tutorial.md` | 6 | stay | P-5 |
| `docs/decisions/` | 11 | stay | P-1 |
| `docs/FxTS/` (the framework pages and the summary) | 15 | `forge-core/docs/fxts/`; the summary (`README.md`) becomes the generated root `fxts/README.md` | P-4, A-2 |
| `docs/governance/facts-developer-guide.md`, `docs/MODULE_BUILDER.md`, `docs/core/manufacturing-entity-catalog.md` | 3 | `forge-core/docs/` | P-4 |
| `docs/DB_ORCHESTRATION_FRAMEWORK.md`, `docs/deployment/clock-discipline.md` | 2 | `forge-hub/docs/` | P-3 |
| `docs/p7-forge-ot/` | 8 | `forge-modules/forge-ot/docs/` | P-2 |
| `docs/spokes/{cmms,erpi,nms}/DISCOVERY.md` | 3 | the `docs/` of forge-cmms, forge-integ-erp-netsuite, forge-nms | P-2 |
| `docs/spoke-onboarding/` | 2 | the `docs/` of forge-ims and forge-wms | P-2 |
| `docs/MDEMG-INIT-BUGS.md`, `docs/MDEMG-PORT-OWNERSHIP-REPORT.md` | 2 | stay (reports to another project's agent) | P-5 |
| `docs/personal/Process-Control-Framework-Context-for-Agent.md` | 1 | `docs/decisions/` | U-2 |
| the other three files of `docs/personal/`, `docs/development/workos_overview.md` | 4 | removed; `docs/personal/` ignored | U-2 |

**Code and governed files** (`src/forge`, 496 files)

| Today | Goes to | Rule |
|---|---|---|
| `core/`, `proto_gen/`, `sdk/`, `adapters/base/`, the module's end of `transport/` | `forge-core/src/python/forge_core/` | P-4 |
| `proto/`, `governance/lists/`, each framework's `schema/` | `forge-core/contract/` | P-4 |
| `governance/shared/`, `fhts/`, each framework's `runners/` and package code | `forge-core/src/python/forge_core/fxts/` | P-4 |
| `governance/fats/specs/` (28), `ftts/specs/` (1), the hub's view spec, object schemas and four view documents | `forge-hub/fxts/` | P-3 |
| `governance/{facts,fmts,fvts,futs}/specs/` of one module | that module's `fxts/` | P-2 |
| the twelve widget specs (`futs`) | `forge-modules/forge-display/fxts/` | P-2 |
| `governance/fmts/conformance.py` | `forge-hub/src/forge_hub/conformance/` | P-3 |
| `api/`, `gateway/`, `ingest/`, `storage/` (with its migrations), `registry/`, `context/`, `curation/`, `broker/`, `observer/`, `cli/`, the hub's end of `transport/` | `forge-hub/src/forge_hub/` | P-3 |
| `adapters/forge_<x>/` (eight), `modules/ot/` | `forge-modules/forge-<x>/src/forge_<x>/` | P-2 |
| `adapters/{csv_file,mqtt_sparkplug,opcua,rest_generic}/` | `forge-core/src/python/forge_core/adapter/generic/` | U-1 |

**Tests** (`tests`, 305 files): each folder follows the code it tests (`tests/core`, `sdk`, most of `governance`, the module's end of `transport` to `forge-core/tests`; `tests/api`, `gateway`, `storage`, … to `forge-hub/tests`; `tests/adapters/forge_<x>`, `tests/modules/ot` to the module). At the root stay the tests that span layers: `test_docs_current.py`, `test_layer_imports.py`, `test_proto_copies.py`, `test_dependency_lock.py`, `test_skips_have_reasons.py`, `test_ci_changed_paths.py`, the framework baseline, `tests/integration/` and `tests/verification/`.

**Everything else**

| Today | Files | Goes to | Rule |
|---|---|---|---|
| `.github/`, `pyproject.toml`, `uv.lock`, `Makefile`, `CLAUDE.md`, `BACKLOG.md`, `README.md`, `SECURITY.md`, `.gitignore`, `.gitleaks.toml`, `.dockerignore`, `tutorial.config.json` | 16 | stay | P-5 |
| `scripts/` (the tutorial tools and checks) | 19 | stay | P-5 |
| `deploy/docker/` | 4 | stay (it starts hub and modules together, development only) | P-5 |
| `deploy/ot/ot-control.example.json` | 1 | `forge-modules/forge-ot/deploy/` | P-2 |
| `go/` | 44 | `forge-core/src/go/`; `go/proto/scanner` and `proto/scanner` to `forge-modules/forge-scanner/` | P-4, P-2 |
| `sdk/` (top level) | 6 | removed: a second copy of `src/forge/sdk/module_builder` (FB-019) | Q-4 |
| `modules/Forge {CMMS,ERPI,NMS,DB Orchestration}/` | 73 | removed (Q-4) | Q-4 |
| `benchmarks/bench_transport.py` | 1 | `forge-core/tests/benchmarks/` | P-4 |
| `.claude/hooks/`, `.serena/` | 5 | stay (tool configuration of the repository) | P-5 |
| `cli_main.py`, `p7-forge-ot-phases1-6.bundle`, `patches/`, `reports/d3-12-verification/`, `scripts/verify_d3.py`, `sidecars/whk-sidecar/` | 20 | removed | U-3, U-4 |

### 10.6 What the rules did not settle: the owner's answers (2026-11-22)

| # | Question | Answer |
|---|---|---|
| U-1 | The four generic adapters (CSV, MQTT Sparkplug, OPC UA, REST). | **[OWNER]** In forge-core, as building blocks, beside the adapter base class (`forge_core/adapter/generic/`). §5 had put them in `forge-modules/generic/`, where no module could import them. |
| U-2 | `docs/personal/` (four tracked files) and `docs/development/workos_overview.md`. | **[OWNER]** The process-control context note moves to `docs/decisions/` beside D-11, which the roadmap and the tutorial cite it with. The two FVTS 0.1.0 working notes, the frontend-framework survey and the vendor overview are removed (the history keeps them). `docs/personal/` is ignored by git and is the owner's private working folder (FB-205). |
| U-3 | One-time artefacts: `p7-forge-ot-phases1-6.bundle`, `patches/`, `reports/d3-12-verification/` with `scripts/verify_d3.py`, `cli_main.py`. | **[OWNER]** Removed; the history keeps them. Any found still in use is not removed and goes back to the owner by name. |
| U-4 | `sidecars/whk-sidecar/`. | **[OWNER]** Removed. Nothing builds, tests or imports it, and the Go forge-mes is the route to the hub (FB-034). |
| U-5 | A `CLAUDE.md` in each major directory. | **[OWNER]** Allowed, not required. The root file is the authority; a lower one may only add to it. |
| U-6 | The backlog. | **[OWNER]** One `BACKLOG.md` at the root. A view by layer may be generated from it later (A-2). |

### 10.7 What is generated (A-2)

| Generated file | From |
|---|---|
| `<major directory>/fxts/README.md` | the governed files in that folder: id, framework, state, hash, and each file's own summary |
| root `fxts/README.md` | every `fxts/` below: per framework its purpose (from its page in `forge-core/docs/fxts/`), its schema version, its specs and their states |
| the counts in the root `README.md` and `docs/WHERE-WE-ARE.md` | the tree and the test collection |

One command builds them and one test fails when any is stale. A spec whose content changed while its summary did not is reported, as a prompt to look, not as a failure.

### 10.8 What holds the structure

One test: every major directory has the required entries of §10.3, no governed file lies outside an `fxts/` or `contract/` folder, and no tracked path lies outside what §10.3 to §10.5 allow. A new top-level folder fails the suite until this record names it.

---

## 11. Amendment 2: what forge-core is

**Status of this section:** the definition of §11.2 and the chain of command of §11.3 are the owner's, accepted on 2026-11-22. They replace the answer to Q-1 in §3 ("the shared foundation, not a running thing"). §11.4 lists what is not yet decided; nothing in it is settled. Backlog: FB-232.

### 11.1 What the owner said (2026-11-22)

**[OWNER]** "forge-core is the administrative manager for a forge deployment, what exactly that means and how it will manifest is to be determined as we work through it. For example: a given forge deployment has 2 sites and a corporate headquarters all in geographically different areas. forge-core manages, tracks, monitors, and alerts on the state of [each site hub, each area hub, and their spokes and modules]. The highest hub in the hierarchy houses forge-core, we must also build in a manner that will allow any individual hub to run autonomously if needed in the event of comms loss."

**[OWNER]** "Forge-core must be the administrative manager and sits above the top level hub running service. Think of it as similar to the EAM module in Ignition. How else would we manage an enterprise deployment? Each site level instantiation of forge-hub must have a centralized location to perform administrative functions. If not we would have to build it all in every hub deployed."

**[FACT]** Q-1 of this record had offered "Core is also a running service" and recorded the other answer, with the words "never a running thing". The owner's first description of the layers (§1) had already said "1 or more hubs for every forge-core deployment". The wording of Q-1's answer was Claude's; this amendment corrects it.

### 11.2 The definition

**[OWNER]** Accepted as written, 2026-11-22.

> **forge-core** is the foundation and the administrative manager of a Forge deployment. There is one per deployment, above the top hub.
>
> As the foundation, it holds what every hub and module is built from: the contract, the FxTS frameworks, and the SDK.
>
> As the manager, it knows every hub and module in the deployment, tracks and monitors their state, raises alerts, and is the one place administrative changes are made and distributed.
>
> It administers; it does not operate. No record and no command passes through it, and a hub that cannot reach it keeps running.

**[OWNER]** The line between the two kinds of work, accepted with the definition:

- **Operations stay in every hub:** ingest, context, storage, alarms, writes to process controllers, and knowing the health of its own modules. A hub that is cut off loses none of this.
- **Administration is forge-core's:** the inventory of every hub and module, deployment-wide state and alerting, and making and distributing changes (specs, schemas, lists, roles, configuration). A hub that is cut off keeps running on what it last received; changes wait until the link returns.

### 11.3 The chain of command

**[OWNER]** "Each hub is the manager of the spokes / modules and DBs attached to it. From a chain of command perspective forge-core is the CEO, forge-hub-enterprise is the VP, forge-hub-site is the director, and forge-hub-area is the plant manager."

| Level | Is | Manages |
|---|---|---|
| forge-core | the administrative manager of the deployment | the whole deployment, through the hubs |
| forge-hub-enterprise | the top hub | the site hubs, and the modules and databases attached to it |
| forge-hub-site | a site's hub | its area hubs, and the modules and databases attached to it |
| forge-hub-area | an area's hub | the modules and databases attached to it |

### 11.4 Not yet decided

Each is the owner's, asked one at a time. Until one is answered, the signed record it touches stands as written.

| # | Question | The record it touches, or the answer |
|---|---|---|
| C-1 | How a hub reaches forge-core. | **Answered 2026-11-22: up the chain of command.** The owner's words: "We long ago established how hubs interact with each other. Each hub only worries about the modules / spokes attached to it and the hub one layer up attached to it." So forge-core is the layer above the enterprise hub; state rolls up one layer at a time and changes roll down the same way. No hub below the enterprise hub connects to forge-core. This is the transport contract's T-13 ("a hub is a module to its parent") applied once more at the top; nothing signed changes. |
| C-2 | Where roles are mastered: today at the "managing hub", the top hub. | `roles.md`, R-16 and R-18 |
| C-3 | Whether the time authority stays with the top hub, time being operational. | `one-clock-ot-source-time.md` |
| C-4 | Where forge-core runs: its own process beside the enterprise hub, or inside it. | A-1; the image and deployment |
| C-5 | What a site that is cut off may administer for itself, and how that is reconciled afterwards. | R-18 (the derived copy) |
| C-6 | The structure rules: the manager is a layer above the hub. It imports the foundation and reaches hubs over the link, never by importing them; the foundation imports nothing of the manager. | §4, S-1 to S-3, and the import-direction test |
| C-7 | A deployment with one site and no enterprise hub: which hub is under forge-core. | R-16 |

### 11.5 Authority in the chain of command (in discussion, not signed)

The owner's statements of 2026-11-22 and 23, recorded as said. Nothing here amends `roles.md` yet: R-16 (roles are assigned at the managing hub) and R-18 (a site's copy is never edited locally) stand until the owner amends them.

**[OWNER]** On where roles are mastered: "If each hub must be able to continue to function if cut off from its superiors then some portion of the roles will need to be handled at each hub level, so this would advocate a semi-decentralized structure that gets its operating parameters from above, but is free to operate as it must within the confines of those operating parameters."

**[OWNER]** On deciding while cut off: "Each hub best knows its operating conditions and what should be able to access it. This is no different in a human chain of command. In the absence of a manager's superior they must make interim decisions, when the superior returns the manager updates their superior on all that requires their attention. If it is determined that one of the 10 decisions the manager made is contrary to a rule the manager was not familiar with it must be rescinded and explained. […] Without the superior's approval the manager's decisions are temporary and subject to modification."

**[OWNER]** On which decisions need review: "Rules or decisions that remain within the constraints passed down require no approval, they were approved when the behavioral contract was established, but decisions or roles that blur the line or sit outside the line but have defendable necessity in the moment are passed up for review before marked as interim.rejected or interim.approved."

**[PROPOSED]** What follows from these, for the owner to confirm or correct:

| # | Rule |
|---|---|
| AU-1 | **A behavioral contract comes down the chain.** Each level receives from the level above what it may decide for itself: the roles that exist, what each may do, and how much of that this level may hand out. It is data, with a hash, approved by the level above (a governed file, as roles files are to be under FSTS). |
| AU-2 | **A decision within the contract is final when made.** It was approved when the contract was. It is reported upward for the record (R-17), not for approval. |
| AU-3 | **A decision at or beyond the line is interim.** It is taken because the moment needs it, it carries the reason, and it goes up for review. The hub decides which side of the line a decision is on by checking it against the contract; a case the contract does not speak to counts as beyond the line. |
| AU-4 | **Review ends in one of two states.** `interim.approved`: the decision stands. `interim.rejected`: it stops applying from then on, and the reason goes back down. |
| AU-5 | **A decision belongs to the level that made it.** The level above approves or rejects; it does not rewrite. |
| AU-6 | **What was done under an interim decision stays on record**, tied to that decision. A rejection does not undo it. |
| AU-7 | **The pattern is one rule for every administrative decision**, not for roles alone (the owner: "decisions or roles"). |

**[OWNER]** Hard limits, 2026-11-23: there are limits that may not be crossed even as an interim decision, and the list of them is dynamic, "added to or subtracted from throughout the course of our full development of the forge framework". It is the governed list `forge-core/contract/lists/hard-limits.list.json`, approved by the owner, shaped as data the hub's decision point can test: each limit names the scopes it covers or the relation between who grants and who receives, says whether it applies always or only to an interim decision, who holds the act instead and why no later rejection can put it right, and what enforces it. A limit is retired, never deleted. The four at approval: `safety-interlock` (interim only: a contract may permit a bypass by a named role), `self-grant`, `grant-beyond-holding` and `owner-approval` (always: no contract may permit them). Nothing enforces them yet, and a test says so.

**[OPEN]** Whether an interim decision is in force while it waits for review; whether an approved interim decision of a kind that recurs is a reason to amend the contract; the scope vocabulary the limits are written in (the five names under `owner-approval` are provisional until FB-189).

### 11.6 What exists today

**[FACT]** The foundation is built and is the package `forge_core` (FB-199) with `forge-core/contract` (FB-227). Nothing of the manager is built: no inventory, no deployment-wide state, no distribution of changes. Hub-to-hub links have no transport yet (the transport contract, T-13; FB-164).

