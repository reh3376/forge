# FMTS — Forge Module Test Specification

**Framework ID:** FMTS
**Full Name:** Forge Module Test Specification
**CI Gate:** Hard-fail (merge-blocking): `tests/governance/fmts/` runs in the `hub-python` job
**Status:** v0.1.0. Schema and runner (`fmts_runner.py`, 19 verdicts per spec). No module has a spec yet (FB-136), and four of the eleven requirements are reported as not checked until the conformance kit exists (FB-137)
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

## The baseline: eleven requirements

| # | Requirement | Checked by this runner |
|---|---|---|
| M-1 | Speaks `forge.v1.AdapterService` to the hub over gRPC and nothing else. | Yes: `hub_link` is fixed by the schema, and no source file names a hub REST route. |
| M-2 | Has an approved FACTS spec, and its manifest matches it. | Yes: the FACTS spec exists, its hash verifies, the owner approved it, and the manifest's `adapter_id`, `version`, `type`, `tier` and `protocol` equal the FACTS identity. |
| M-3 | Declares a time contract for every counterpart it exchanges data with. | Yes: see "The time contract". |
| M-4 | Implements the time exchange on Register, Health and Ingest and reports its measurement. | **No.** Needs a running module: the conformance kit (FB-137). |
| M-5 | Fails closed on a clock it cannot trust and on a refusal from the hub, with the cause on its health. | **No.** FB-137. |
| M-6 | Stamps UTC, timezone-aware, and never invents a source time. | **No.** FB-137. |
| M-7 | Reports health, with refusals by cause. | **No.** FB-137. |
| M-8 | Holds only Forge-issued credentials and owns no database connection of its own. | Yes, for databases: none is the module's own, a hub database takes a Forge-issued credential. Credentials for a third-party system's API are not declared or checked (FB-142). |
| M-9 | Ships no user interface code; describes its screens in FVTS specs. | Yes: no `.tsx`, `.jsx`, `.vue` or `.svelte` file in the module's source; a module with screens names FVTS specs that exist and belong to it. The display module is the one kind this does not bind. |
| M-10 | Declares its roles and scopes. | Yes: the roles file exists and each role has a kebab-case id, scopes of the form `domain:resource:action`, and inherits only roles the file defines. The roles file has no FxTS spec of its own (FB-141). |
| M-11 | Is built from the module SDK template for its language. | Yes, by layout: the six files of the Python adapter template, or the Go module layout. |

A requirement the runner cannot check is reported on every run as `SKIP` with the text `NOT CHECKED`. It is never counted as passed, and `forge governance run fmts` prints it under "Not checked:".

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
- **M-3 and M-4 cannot be waived.** Time-keeping is the core requirement, and the hub refuses a module that does not exchange time whatever its spec says.

## Spec sections

| Section | Content |
|---|---|
| `spec_version` | `0.1.0` |
| `module_identity` | `module_id`, `name`, `version`, `kind` (`management`, `integration`, `ot`, `display`), `language` (`go`, `python`, `typescript`), `source_paths` |
| `hub_link` | `protocol: grpc`, `service: forge.v1.AdapterService` (both fixed) |
| `references` | `facts` (path and `adapter_id`), `manifest`, `fvts` (paths), `roles` (path) |
| `baseline` | `M-1` to `M-11`, each `met` or `waived` |
| `waivers` | `requirement`, `reason`, `backlog_item` |
| `time_contract` | `hub`, `plant_floor_devices`, `databases`, `third_party_systems` |
| `user_interface` | `ships_ui_code`, `screens` |
| `scaffold` | `template`: `python-adapter`, `go-module` or `none` |
| `metadata` | free-form, not enforced |
| `integrity` | the FHTS block |

All paths are relative to the repository root and must stay inside it.

## Checks

Every run gives 19 verdicts: `fmts:schema-valid`, `fmts:identity-match`, `fmts:hash-verified`, `fmts:hash-approved`, `fmts:enum-parity`, `fmts:source-paths`, `fmts:waivers`, one per requirement (`fmts:m1` to `fmts:m11`) and `fmts:metadata`. When the spec fails its schema, the run stops after the first five: the schema failure is the finding.

`fmts:enum-parity` fails if the tolerance classes drift from FACTS `time_governance.tolerance_class`, or the schema's baseline from the runner's eleven requirements.

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
| No module has an FMTS spec | FB-136 |
| M-4 to M-7 are not checked; the conformance kit does that | FB-137 |
| The hub does not probe its own databases' clocks | FB-138 |
| No integration module reads its third-party system's clock | FB-139 |
| The hub does not require an approved FMTS spec at Register; the scaffold does not generate one | FB-140 |
| The roles file has no FxTS spec; FMTS checks only its shape | FB-141 |
| Who issues and holds an integration module's third-party credentials is undecided and unchecked | FB-142 |
| M-11 is checked by file layout, not by a marker the scaffold writes | FB-140 |
