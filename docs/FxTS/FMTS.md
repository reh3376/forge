# FMTS — Forge Module Test Specification

**Framework ID:** FMTS
**Full Name:** Forge Module Test Specification
**CI Gate:** Hard-fail (merge-blocking): `tests/governance/fmts/` runs in the `hub-python` job
**Status:** v2.0.0 (2026-11-19, FB-153: the module's function, the integration section, and in `transport` the data classes, the buffer, the last will and a keepalive limit; values come from four governed lists). Earlier the same day 1.0.0 added the transport contract's five requirements, M-12 to M-16 (FB-165); 0.2.0 added the module alias; 0.1.0 is kept for history. Schema, runner (`fmts_runner.py`, 29 verdicts per spec) and nine module specs, eight approved by the owner. The conformance kit runs four of the sixteen requirements against every module on the Python adapter template (FB-137); for the modules it cannot drive they are reported as not checked (FB-155). The five transport requirements have no kit check yet, because the transport contract is not built (FB-164): every module waives the ones that bind it.
**Decided in:** [`docs/decisions/forge-module-requirements.md`](../decisions/forge-module-requirements.md) (D-12, signed by the owner on 2026-11-17)
**MDEMG Analog:** None

---

## Purpose

FMTS states what every Forge module must do before a hub admits it, and checks it. Everything that registers with a hub is a module: management modules, integration modules, the OT module, forge-display and the Python adapters.

One FMTS spec per module is that module's entry in governance. It does not repeat what the module's other specs declare. It names them and requires them:

- the **FACTS** spec (adapter conformance and `time_governance`),
- the **FVTS** specs (the module's screens),
- the **roles file** (the module's shipped roles and scopes).

A module without an approved FMTS spec is not a Forge module. The hub does not enforce that at Register yet (FB-140).

## The baseline: sixteen requirements

| # | Requirement | Checked by this runner |
|---|---|---|
| M-1 | Speaks `forge.v1.AdapterService` to the hub over gRPC and nothing else. | Yes: `hub_link` is fixed by the schema, and no source file names a hub REST route. |
| M-2 | Has an approved FACTS spec, and its manifest matches it. | Yes: the FACTS spec exists, its hash verifies, the owner approved it, the manifest's `adapter_id`, `version`, `type`, `tier` and `protocol` equal the FACTS identity, and its `schema_ref` equals the spec's (the hub refuses a registration where it does not). |
| M-3 | Declares a time contract for every counterpart it exchanges data with. | Yes: see "The time contract". |
| M-4 | Implements the time exchange on Register, Health and Ingest and reports its measurement. | By the conformance kit, for a Python module: every request carries T1 and, after the first, the measurement of the exchange before it; the hub holds a two-way measurement. |
| M-5 | Fails closed on a clock it cannot trust and on a refusal from the hub, with the cause on its health. | By the kit: with the module's clock 5 s out the hub refuses it, nothing is delivered, the module's own health counts the refusal under its cause, and it is readmitted when the clock is put right. |
| M-6 | Stamps UTC, timezone-aware, and never invents a source time. | By the kit, when the module has sample events: every stamp on every record sent is UTC and each record carries the module's send time. A source event without a stamp is not covered yet. |
| M-7 | Reports health, with refusals by cause. | By the kit: the health has `state`, `refusals` and `last_refusal`; none before a refusal; after one, the cause is counted, the last refusal is named and the state is not HEALTHY. |
| M-8 | Holds only Forge-issued credentials and owns no database connection of its own. | Yes, for databases: none is the module's own, a hub database takes a Forge-issued credential. Credentials for a third-party system's API are not declared or checked (FB-142). |
| M-9 | Ships no user interface code; describes its screens in FVTS specs. | Yes: no `.tsx`, `.jsx`, `.vue` or `.svelte` file in the module's source; a module with screens names FVTS specs that exist and belong to it. The display module is the one kind this does not bind. |
| M-10 | Declares its roles and scopes. | Yes: the roles file exists and each role has a kebab-case id, scopes of the form `domain:resource:action`, and inherits only roles the file defines. The roles file has no FxTS spec of its own (FB-141). |
| M-11 | Is built from the module SDK template for its language. | Yes, by layout: the six files of the Python adapter template, or the Go module layout. |
| M-12 | Gives every record a stable record id. | Not yet: by the conformance kit when the transport contract is built (FB-164). A claim of `met` is reported as not checked. |
| M-13 | Stores and forwards what it cannot deliver, with a declared capacity. | Not yet (FB-164). |
| M-14 | Says goodbye on a proper shutdown and declares a last will. | Not yet (FB-164). |
| M-15 | Refuses a command that arrives after its expiry. Binds only a module that declares `transport.process_control_writes`. | Not yet (FB-164). The declaration is checked now, by `fmts:transport`. |
| M-16 | Applies each business write-back once by its id and confirms it. Binds only a module that declares `transport.business_write_backs`. | Not yet (FB-164). The declaration is checked now. |

M-12 to M-16 are the amendment of 2026-11-19 (`docs/decisions/forge-module-requirements.md` §9): what the transport contract (D-15) requires of a module. Two words are the owner's definitions. A **command** is a write to a tag in a process controller (PLC or HMI) that directly affects a process: delivered at most once, never stored, and it expires. A **business write-back** is a message down to a business system: delivered and confirmed once and only once, kept while a link is down, and it does not expire as a command does. A module that declares neither is not bound by M-15 or M-16 and claims `not_applicable`; the runner holds that claim to the module's FACTS spec. M-15 is waived only with admin privileges, like M-3 and M-4.

A requirement that was not checked is reported on every run as `SKIP` with the text `NOT CHECKED` and the reason. It is never counted as passed, and `forge governance run fmts` prints it under "Not checked:".

## The time contract

One entry for every counterpart, and every entry fails closed.

| Counterpart | What the spec declares | What the runner checks |
|---|---|---|
| The hub | `exchange: four-timestamp`, `fail_closed: true` | The tolerance class of the link is the one the FACTS spec declares in `time_governance`. It is not repeated here, and a FACTS spec without one fails. |
| Plant-floor devices | `none` or `declared-in-facts` | An `ot` module must declare them. When declared, FACTS `time_governance` names a `clock_read_method` or declares `source_timestamp_origin: forge`. |
| A hub database | `owner: hub`, the access, `credential: forge-issued`, `written_time_source` | A database the module writes names which governed clock its times come from: `module-clock` or `hub-clock`. The database's own `now()` is not a permitted value. The hub checks the clock of its own databases (FB-138), so a module declares no tolerance for one. |
| A third-party database | `owner: third-party`, `clock_read_method`, tolerance class, probe cadence, `offset_reported: true` | The integration module measures that server's clock, corrects its times to master time and reports the offset on the record. |
| A third-party system | `interface`, `clock_read_method`, tolerance class, probe cadence, `offset_reported: true` | An `integration` module declares at least one. A readable clock declares its class, cadence and that the offset is reported. |
| An unreadable clock | `clock_read_method: unreadable`, `polling_interval_seconds` | This is a declaration, not an exemption: the module's own governed read time is the stamp and the polling interval is recorded as the uncertainty on every record. It may not also claim a tolerance class. |

The fields the offset and the uncertainty travel in already exist on the record (`source_offset_seconds`, `source_time_as_sent`, `source_clock`, `source_uncertainty_seconds`; one-clock record P-3). Reading the clocks is FB-139.

## The conformance kit

`src/forge/governance/fmts/conformance.py`. M-4 to M-7 can only be checked on a running module, so the kit runs one:

- **The reference hub** is the real hub servicer on clocks the kit controls. A refusal that takes three probes a second apart on a plant network takes no time here, and the hub that judges the module is the one in production.
- **A driver** is how the kit reaches a module, and is the only part written per kind of module. `PythonAdapterDriver` drives any `AdapterBase` through the transport Python modules ship with.
- **The runner runs the kit** for every module on the `python-adapter` template. It finds the one adapter class in the module's `adapter.py`, gives it placeholder connection parameters (hosts under `.invalid`, so nothing is reached) and the module's fixture, if it has one.
- **A fixture** is `tests/governance/fmts/conformance/<module_id>.json`: optional `params` and raw source `events`. Without events the module sends nothing and M-6 is reported as not checked.
- **A Python module off the template supplies a hook**, `conformance.py` beside its `adapter.py`: `conformance_adapter()` builds the adapter as the module builds it, and `conformance_load(adapter)` gives it something to send. The OT module has one: its adapter on a real tag registry, with two stamped tags.
- A module the kit cannot drive (another language, another process) is reported as `NOT CHECKED` for all four (FB-155).

What the kit found on the OT module, fixed with its hook (2026-11-18): collect awaited a registry method only the test doubles had; the tag-change callback's signature did not match the registry's call, so no subscription fired; the manifest and three record producers carried an older schema reference than the approved FACTS spec, so the hub would have refused the registration and rejected every record.

What the kit found on its first run, fixed with it: the Python transport did not put a refusal by the hub on the module's own health; one adapter left refusals out of its health; one returned to HEALTHY whenever its API answered, hiding a standing refusal.

## Waivers

A module that cannot yet meet a requirement says so in its spec:

```json
"baseline": { "M-9": "waived", "...": "met" },
"waivers": [
  {
    "requirement": "M-9",
    "reason": "The interim bridge ships its own Next.js frontend until forge-display exists.",
    "backlog_item": "FB-076"
  }
]
```

- The owner approves a waiver by approving the spec's hash. Nobody else can.
- A waived requirement is reported on every run as `SKIP` with the text `WAIVED until FB-nnn` and the reason.
- The backlog item must be in `BACKLOG.md` and open. When it is closed (its description starts with `**Done` or `**Fixed`), the waiver has expired and the run fails until the requirement is met and the waiver removed.
- A claim of `waived` with no waiver, or a waiver for a requirement claimed `met`, fails. In both cases the requirement is still enforced.
- **M-3 and M-4 are waived only with admin privileges** (owner, 2026-11-18, Q-10 of the record). They are the time-keeping requirements. A waiver of either counts only once the spec's hash is approved; on a spec that is not approved, `fmts:waivers` fails and names it. Only the owner approves a hash today. The waiver covers this check only: the hub still refuses at runtime a module that does not exchange time.

## Spec sections

| Section | Content |
|---|---|
| `spec_version` | `2.0.0` |
| `module_identity` | `module_id`, `name`, `alias` (the module's shortcut name: short, lower case, unique among the modules; `wms` for `forge-wms`), `version`, `kind` (`management`, `integration`, `ot`, `display`), `function` (the service the module performs, from the governed list of module functions), `language` (`go`, `python`, `typescript`), `source_paths` |
| `hub_link` | `protocol: grpc`, `service: forge.v1.AdapterService` (both fixed) |
| `transport` | `process_control_writes` and `business_write_backs`, each true or false; `data_classes`, the classes the module carries; optional `store_and_forward` (a size range, an age range, the pruning strategies it supports), `last_will` (a message and an alarm priority) and `keepalive_max_seconds` |
| `integration` | only for kind `integration`, and required there: `product`, optional `vendor`, `supported_versions`, `interfaces` (from the governed list of application-side protocols), `direction`, `site_owner`, `credential` (a name, never the secret) |
| `references` | `facts` (path and `adapter_id`), `manifest`, `fvts` (paths), `roles` (path) |
| `baseline` | `M-1` to `M-16`, each `met` or `waived`; `M-15` and `M-16` may also be `not_applicable` |
| `waivers` | `requirement`, `reason`, `backlog_item` |
| `time_contract` | `hub`, `plant_floor_devices`, `databases`, `third_party_systems` |
| `user_interface` | `ships_ui_code`, `screens` |
| `scaffold` | `template`: `python-adapter`, `go-module` or `none` |
| `metadata` | free-form, not enforced |
| `integrity` | the FHTS block |

All paths are relative to the repository root and must stay inside it.

## Checks

Every run gives 29 verdicts: `fmts:schema-valid`, `fmts:identity-match`, `fmts:hash-verified`, `fmts:hash-approved`, `fmts:schema-current`, `fmts:enum-parity`, `fmts:source-paths`, `fmts:waivers`, `fmts:lists`, `fmts:function`, `fmts:integration`, `fmts:transport`, one per requirement (`fmts:m1` to `fmts:m16`) and `fmts:metadata`. When the spec fails its schema, the run stops after the first five: the schema failure is the finding.

`fmts:enum-parity` fails if the tolerance classes drift from FACTS `time_governance.tolerance_class`, or the schema's baseline from the runner's sixteen requirements.

`fmts:transport` fails when a module that declares no downward writes claims anything but `not_applicable` for M-15 or M-16, when a module declares a kind of downward write while its FACTS spec declares no write capability, when the FACTS spec declares the write capability and the module declares neither kind, or when a module of kind `ot` with the write capability does not declare process-control writes.

## Governed lists

Four fields take their values from lists that can grow without a schema version (owner, 2026-11-19). Each list is a file under `src/forge/governance/lists/`, hashed and approved by the owner like a spec, shown by `forge governance specs`, and changed with `forge governance stamp` and `approve`. A module spec fails `fmts:lists` while any of them does not verify or is not approved.

| List | File | Used by | Entries today |
|---|---|---|---|
| Module functions | `module-functions.list.json` | `module_identity.function` | mes, wms, cmms, erp, nms, ims, historian, scanner, ot, display, creds, mpc, qms, lims |
| Application-side protocols | `application-protocols.list.json` | `integration.interfaces` | rest, graphql, mqtt, opc-ua, sql, amqp, file |
| Data classes | `data-classes.list.json` | `transport.data_classes` | thirteen parents: raw, curated, historical, alarm, audit, status, live, control, write-back, config, security, request, artifact |
| Pruning strategies | `pruning-strategies.list.json` | `transport.store_and_forward.pruning` | drop-oldest (the default), by-class-priority |

A data class is named `parent` or `parent.child`. Each parent has one rule (direction, the links it may travel, its delivery guarantee, whether it is stored, whether it expires); a sub-class inherits it and may only tighten its numbers, and the loader refuses a sub-class that restates a rule. The rules of each parent are in `docs/decisions/transport-contract.md`, "Data classes: parents and sub-classes"; the numbers come with FB-164.

`fmts:transport` also holds the declared classes to the rest of the spec: a module that declares process-control writes carries `control` and no other module does; the same for business write-backs and `write-back`; a module whose FACTS spec declares backfill carries `historical`; a module that claims M-13 met declares its buffer, and one that claims M-14 met its last will.

To add an entry: edit the list, `forge governance stamp <list> --by <you> --reason <why>`, and the owner approves it.

## The module specs

`src/forge/governance/fmts/specs/` holds one spec for each module that has a FACTS spec. `tests/governance/fmts/test_module_specs.py` runs all of them in CI and names every failure it allows.

| Module | Kind | Waived | State |
|---|---|---|---|
| forge-wms, forge-cmms, forge-nms, forge-historian, forge-ims | management | M-10 (FB-141); M-12 to M-14 (FB-164) | **approved by the owner 2026-11-19** (1.0.0; first on 2026-11-18); every other requirement passes, M-4 to M-7 run by the kit |
| forge-integ-erp-netsuite | integration | M-10 (FB-141); M-12 to M-14 (FB-164) | **approved by the owner 2026-11-19**; the same |
| forge-scanner | management | M-3 (FB-117), M-10 (FB-141); M-12 to M-14 (FB-164) | **approved by the owner 2026-11-19**, which is what makes its time-keeping waiver count; M-6 not checked (no sample events) |
| forge-ot | ot | M-10 (FB-141), M-11 (FB-146); M-12 to M-15 (FB-164) | **approved by the owner 2026-11-19**; it declares process-control writes, so M-15 binds it and its waiver is admin-level; M-4 to M-7 run by the kit through the module's own hook |
| forge-mes (the interim bridge) | management | M-3 (FB-145), M-8 (FB-057), M-9 (FB-181), M-10 (FB-141), M-11 (FB-076); M-12 to M-14 and M-16 (FB-164): it declares business write-backs | `pending_review` by the owner's decision: M-4 to M-7 are not checked, because the kit cannot drive a TypeScript process (FB-155); `waivers` fails until approved (the M-3 waiver needs admin privileges) |

The owner reviewed all nine on 2026-11-18, the first line by line, and approves a module spec only when the conformance kit has run M-4 to M-7 against the module.

The six management modules that are approved are Forge's own (owner, 2026-11-18). An existing application was the example each is built from; today each is a Python adapter that holds the data contract taken from that example, and its own logic, storage and screens are not built. The target is a Go module with Python scripting for customization. Each declares its hub database as the rule it is built to: `mod_wms`, `mod_cmms`, `mod_nms`, `mod_ims`, and for forge-historian the hub's time-series store (what forge-historian is to become: FB-157). forge-scanner has no database; its counterparts are the handheld scanners, plant-floor devices whose clocks nothing can read yet (FB-117).

forge-integ-erp-netsuite is an integration module for one named product. It keeps the hub schema `mod_erpi` through an explicit mapping in `forge.storage.access`, because its id no longer derives that name. Nothing reads the product's clock yet (FB-139).

Module names (A-17): a module Forge builds is `forge-<service>`; a module that integrates an existing system is `forge-integ-<function>-<product>`.

## Running it

```bash
forge governance run fmts <module_id>             # looked up in src/forge/governance/fmts/specs
forge governance run fmts path/to/x.fmts.json     # or a spec file
forge governance stamp path/to/x.fmts.json        # after an edit
forge governance approve path/to/x.fmts.json --by reh3376    # the owner only
```

## What is not built

| Gap | Backlog |
|---|---|
| The interim MES bridge's module spec waits for a kit driver for a TypeScript process | FB-155 |
| The OT manifest's data contract differs from its FACTS spec in tier vocabulary, output format and context fields (the hub warns) | FB-158 |
| The interim MES bridge cannot state a governed time source; M-3 is waived | FB-145 |
| The OT module is not built from a template (M-11 waived), and its local SQLite buffer is not declared | FB-146, FB-147 |
| No clock-read method exists for a gRPC server | FB-139 |
| M-4 to M-7 are not checked for a module in another process or language (forge-ot, forge-mes) | FB-155 |
| M-6 is checked only where a module has sample events (forge-wms); a source event without a stamp is not covered | FB-137 |
| The hub does not probe its own databases' clocks | FB-138 |
| No integration module reads its third-party system's clock | FB-139 |
| The hub does not require an approved FMTS spec at Register; the scaffold does not generate one | FB-140 |
| The roles file has no FxTS spec; FMTS checks only its shape | FB-141 |
| Who issues and holds an integration module's third-party credentials is undecided and unchecked | FB-142 |
| M-11 is checked by file layout, not by a marker the scaffold writes | FB-140 |
