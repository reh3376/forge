# FVTS — Forge View Test Specification

**Framework ID:** FVTS
**Full Name:** Forge View Test Specification
**CI Gate:** Hard-fail (merge-blocking) — `tests/governance/fvts/` runs in the `hub-python` job
**Status:** v0.2.1 (a patch step of 2026-11-22 that corrects two descriptions, FB-226; the two specs stay on 0.2.0, which they declare). v0.2.0 (2026-11-21, FB-177: objects beside points, a minor step released and approved under the schema version rules). Schema, runner (`fvts_runner.py`, 21 checks), reference renderer, two golden sets and two specs: the hub's own (`forge-core.fvts.json`, approved by the owner) and the plant-floor reference (`forge-ot.fvts.json`, `pending_review` until FB-078). forge-display itself has no code (FB-181).
**Phase:** TBD (forge-display)
**MDEMG Analog:** None — new for forge-display

> **Name note.** FDTS ("Display") would collide with the existing FDTS (Forge *Data* Test Specification), so this framework is FVTS — "View". The owner confirmed the name on 2026-11-03 (D-4, item 1 below).

---

## Purpose

FVTS governs the contract between Forge modules and **forge-display**, the module that builds every user-facing display: forge-core screens, settings, module views, operator HMI (Human-Machine Interface) screens, dashboards, trends, desktop GUI (Graphical User Interface) apps, browser UIs (User Interfaces) and mobile apps.

The governing rule: **modules describe, forge-display renders.** A module never ships UI code against its own data. It declares, in one FVTS spec:

- **what can be shown** — data bindings, live-update behaviour, history/trending, alarms;
- **what can be done** — actions (tag writes, alarm operations, module commands) and settings;
- **where** — surfaces (screens) and the render profiles each is allowed on.

Renderers — whatever framework implements them (Slint, egui, Dioxus, a browser stack, a mobile toolkit) — consume only what an FVTS spec declares. This keeps the contract stable while UI frameworks change, and guarantees that safety behaviour (roles, confirmation, interlocks, audit) is identical on every surface because it is declared once and enforced in forge-core.

## What FVTS Governs

| Aspect | What the spec declares | What the schema / runner checks |
|--------|------------------------|---------------------------------|
| **Identity** | view_id, version, owner module, FACTS spec ref | Kebab-case IDs, semver, owner exists in FACTS |
| **Scope** | ISA-95 levels, required RecordContext fields, multi-site | Enum membership; cross-site views are read-only |
| **Data bindings** | Points: source tag path, type, units, precision, range, timestamp basis, quality handling | Units/precision required for numerics, labels for enums, stale threshold, no unmarked BAD values |
| **Live updates** | Transport, max rate, coalescing, heartbeat, disconnect behaviour | Rate ≤ 20 Hz, `latest_wins`, `mark_all_stale` on disconnect |
| **History** | Server-side decimation, algorithm, point cap, range, as-of support | Decimation is always server-side; caps present when enabled |
| **Alarms** | States, priorities, reserved priority tokens, annunciation | All 7 ISA-18.2 states covered; tokens in the reserved `alarm.*` namespace |
| **Actions** | Kind, target, role, confirmation, reason code, interlock feedback, handled statuses, audit, profiles | Tag writes need confirmation, a write-capable role, interlock feedback and all 9 WriteStatus values; audit always on |
| **Settings** | Settings schema ref, edit role, apply mode, profiles | Required fields when exposed |
| **Render profiles** | Supported profiles and tightening overrides | Overrides never loosen the baseline |
| **Surfaces** | Kind, authoring (configured/coded), scope level, profiles, points, actions | HMI screens are `configured`; every referenced point/action exists |
| **Design system** | Token set ref, ISA-101 high-performance flag | ISA-101 flag true when any surface is an `hmi_screen` |
| **Conformance tests** | Suite path, golden messages, renderers under test | Paths exist; each listed renderer passes the golden set |

## Binding to existing Forge models

FVTS does not invent parallel vocabularies. Its enums mirror the models already in the codebase, and the runner check `fvts:enum-parity` fails if they drift:

| FVTS `$def` | Mirrors |
|-------------|---------|
| `qualityCode` | `forge_core.models.contextual_record.QualityCode` |
| `contextField` | `forge_core.models.contextual_record.RecordContext` fields |
| `timestampBasis` | `RecordTimestamp.TIME_BASES` (`source_time`, `server_time`, `ingestion_time`); `spoke_time` (the spoke's own send time; `sent_time` and hub-local until FB-092) is a clock-offset input (FB-087/FB-089), not a basis |
| `alarmState`, `alarmPriority` | `forge_core.models.alarm.AlarmState` / `AlarmPriority` |
| `alarmOperation` | Operator-initiated subset of `AlarmAction` (system actions are never UI actions) |
| `role` | `forge_core.models.control.WriteRole` **plus `VIEWER`** (read-only; see open decisions) |
| `writeStatus` | `forge_core.models.control.WriteStatus` |

Live updates with `transport: grpc_stream` ride the FTTS-governed gRPC transport.

## Objects: collections with a schema

A point is one live value. Most of what a hub or a management module shows is not that: it is a list of things, such as modules, specs, lots or work orders. Since v0.2.0 a module declares those as **objects** in `data_bindings.objects`, beside its points (owner, 2026-11-21).

| Field | Meaning |
|---|---|
| `object_id`, `object_label` | its id in this contract and the name shown |
| `schema_ref` | the schema of one of these things as the one schema registry knows it (D-10): `forge://schemas/<owner>/<Entity>/v<version>` |
| `schema_path` | where that JSON Schema document is in the repository |
| `schema_hash` | the hash of that document |
| `key_field` | the field that identifies one of them |
| `delivery` | `request` (fetched when a screen asks) or `push` (changes are sent as they happen) |

- **forge-display generates tables, forms and detail pages from the object's schema** (D-16, Q-3). A field added to the schema appears on the screens without forge-display changing.
- **An object's schema is covered by the spec's approval.** Its hash is part of the spec's content, so a schema changed after approval fails `fvts:objects` until the spec is stamped and the owner approves it again.
- **A surface lists the objects it shows**, as it lists its points. A `module_command` may name the object it acts on (`target_object`); the same role, confirmation and audit rules apply as for any action.
- **A contract declares at least one point or one object.** The hub's has no points.
- A reference renderer message, `object_list`, holds every item to the object's schema and takes its columns from the schema, not from the items.

Runner check `fvts:objects`: each schema is a file in the repository, a valid JSON Schema, with the id the spec names, the hash the spec records, and the owner's own namespace; the key is a required field; a command's target is a declared object.

## Render profiles — normative baseline

A profile carries one platform limit, the update rate. **Who may act is decided by the user's role, on every profile** (owner, 2026-11-19 and 21; `docs/decisions/forge-display.md`, Q-7 and Q-8): a tag write and every alarm operation are open on all four, so an operator can monitor and control a process from a carried tablet or laptop, and the activity record names the profile each action came from. Two things can narrow a profile and neither can widen it: a spec may **tighten** it (via `render_profiles.overrides`, and by the profiles an action lists), and a site may switch tag writes or alarm operations off for a profile (`SitePolicy`). Runner check `fvts:profile-baseline`. The table is code: `forge-core/src/python/forge_core/fxts/fvts/profiles.py` (`PROFILE_BASELINE`).

| Profile | Intended renderer | Max update rate | Tag writes | Alarm operations | Kiosk / fullscreen | Notes |
|---------|-------------------|-----------------|------------|------------------|--------------------|-------|
| `desktop_hmi` | Operator HMI on plant-floor industrial PCs | 20 Hz | Per role | All, per role | Yes | Must keep displaying (marked stale) through network loss |
| `desktop_app` | MES, forge-core admin, engineering tools | 10 Hz | Per role | All, per role | No | Settings and configuration live here |
| `web` | A browser: remote dashboards, a carried laptop | 4 Hz | Per role | All, per role | No | A cross-site view stays read-only (`fvts:cross-site-read-only`) |
| `mobile` | Phones and tablets | 1 Hz | Per role | All, per role | No | Notification-driven; reduced payloads |

Consequences enforced by the runner:

- An action's `allowed_profiles` must be a subset of `render_profiles.supported` **and** of the profiles whose baseline permits that action kind (`fvts:action-profile-permitted`).
- A surface may list actions the active profile forbids; renderers must hide them rather than disable them (`fvts:profile-action-filter`).

## Schema

**Location:** `forge-core/contract/fxts/fvts/schema/fvts.schema.json`
**`$id`:** `forge://governance/fvts/v0.1.0`

### Top-Level Structure

```
fvts.schema.json
├── spec_version          # const "0.1.0"
├── view_identity         # view_id, name, version, owner_module, facts_spec_ref?, description?
├── scope                 # isa95_levels[], required_context_fields[], multi_site
├── data_bindings
│   └── points[]          # point_id, label, source{adapter_id, tag_path}, data_type,
│                         # engineering_units, display_precision, range{lo,hi}, enum_labels,
│                         # timestamp_basis, quality_handling{stale_after_ms, on_bad, on_uncertain}
├── live_updates          # transport, max_update_rate_hz, coalescing, heartbeat_ms,
│                         # on_disconnect, reconnect{initial_backoff_ms, max_backoff_ms}
├── history               # enabled, decimation{location, algorithm}, max_points_per_series,
│                         # max_range_days, as_of_queries, timestamp_basis
├── alarms                # enabled, states[], priorities[], priority_tokens{}, audible_annunciation
├── actions[]             # action_id, label, kind, target_point | alarm_operation | command,
│                         # parameters_schema_ref, required_role, confirmation, reason_code_required,
│                         # interlock_feedback, handled_statuses[], timeout_ms, audit, allowed_profiles[]
├── settings              # exposed, schema_ref, required_role, apply_mode, allowed_profiles[]
├── render_profiles       # supported[], overrides{profile: {max_update_rate_hz, writes_permitted,
│                         #                                  alarm_operations_permitted}}
├── surfaces[]            # surface_id, title, kind, authoring, scope_level, allowed_profiles[],
│                         # points[], actions[]
├── design_system         # tokens_ref, isa101_high_performance
├── conformance_tests     # suite_path, golden_messages_path, renderers_under_test[]
├── metadata              # free-form
└── integrity             # FHTS Layer 1
```

### Rules encoded directly in the schema

- `additionalProperties: false` throughout — no undeclared fields slip into a contract.
- Numeric points require `engineering_units` and `display_precision`; `ENUM` points require `enum_labels`.
- BAD / NOT_AVAILABLE values are never shown without a marker; UNCERTAIN always carries a marker.
- `live_updates.on_disconnect` is `mark_all_stale`; values never silently freeze.
- History decimation is `server`-side only.
- `tag_write` actions: role ∈ {OPERATOR, ENGINEER, ADMIN}; confirmation `confirm` or `two_step_with_review`; `interlock_feedback: true`; all 9 `WriteStatus` values handled (`REJECTED_REVIEW` since FB-074); `timeout_ms` required.
- `two_step_with_review` and `reason_code_required` are enforced server-side (FB-074): the OT write engine stages the write, returns the current value and a single-use review token, and refuses a commit without it (`REJECTED_REVIEW`). A renderer draws the review; it cannot skip it.
- Alarm `SHELVE`, `DISABLE` and `RESET` require a reason code.
- Every action has `audit: true`.
- `hmi_screen` surfaces are `configured` (versioned layout data), never hand-coded.
- Alarm priority tokens must live in the reserved `alarm.*` token namespace.

### Runner checks — `forge-core/src/python/forge_core/fxts/fvts/runners/fvts_runner.py`

`FVTSRunner(FxTSRunner)` produces one verdict per check (19 for the reference spec). `fvts:schema-valid` applies the schema itself, so every schema-encoded rule above is enforced; the other checks add what JSON Schema cannot express.

| Check ID | Rule |
|----------|------|
| `fvts:schema-valid` | Spec validates against `fvts.schema.json`; each violation names its JSON path |
| `fvts:identity-match` | `view_identity.view_id` equals the run target |
| `fvts:hash-verified` | FHTS integrity block present and `spec_hash` matches the content |
| `fvts:hash-approved` | `hash_state: approved` with an `approved_by` (warning severity until the owner approves) |
| `fvts:enum-parity` | Schema `$defs` match the Python models listed above (and the baseline's alarm operations match `AlarmAction`) |
| `fvts:owner-in-facts` | `owner_module` has a FACTS spec, `facts_spec_ref` exists, every bound `adapter_id` has a FACTS spec |
| `fvts:unique-ids` | Point, action and surface ids are unique |
| `fvts:surface-refs` | Every surface point/action ID exists |
| `fvts:action-target` | `tag_write.target_point` exists, is bound to the owner, the owner's FACTS has `capabilities.write`; alarm operations need `alarms.enabled`; with an OT write config (`write_config=`), the tag path must match a `write_tags` entry that is writable, type-compatible and at least as wide as the display range |
| `fvts:action-profile-permitted` | Action profiles ⊆ supported profiles ∩ baseline-permitted profiles |
| `fvts:profile-supported` | Surface, settings, override and renderer profiles ⊆ `render_profiles.supported` |
| `fvts:profile-baseline` | Overrides only tighten the baseline; evidence lists the effective limits per profile |
| `fvts:profile-action-filter` | Every surface action is visible on at least one of the surface's profiles; evidence lists the visible/hidden split per surface and profile |
| `fvts:cross-site-read-only` | If `multi_site`, no `tag_write` actions are reachable from surfaces |
| `fvts:isa101-required` | `isa101_high_performance: true` when any surface is `hmi_screen` |
| `fvts:range-sane` | `range.lo < range.hi`; `reconnect.initial_backoff_ms ≤ max_backoff_ms` |
| `fvts:conformance-paths` | `suite_path` and `golden_messages_path` exist in the checkout |
| `fvts:golden-messages` | Each `renderers_under_test` profile renders the golden message set through the reference renderer without error; a spec without renderers or messages fails |
| `fvts:metadata` | Free-form object |

Schema-runner parity holds: `implemented_fields()` lists every top-level property and every `$defs` property (`$.point_id`, `$.handled_statuses`, …), and `tests/governance/fvts/test_fvts_runner.py` asserts the set equals what the schema declares, so a schema change without a runner change fails CI.

### Golden messages and the reference renderer

`forge-core/src/python/forge_core/fxts/fvts/renderer.py` is the smallest faithful model of what any forge-display renderer must do with the contract; it is not a UI. `ReferenceRenderer(spec, profile)` renders six message types and raises `GoldenRenderError` on any contract breach:

| Message | What the renderer enforces |
|---------|----------------------------|
| `subscription_update` | Points are declared; `required_context_fields` present; quality is a `QualityCode`; the point's `timestamp_basis` is present; stale by `stale_after_ms`; BAD/NOT_AVAILABLE per `on_bad` (blank or last good value, always with a marker); UNCERTAIN marked; numerics formatted with `display_precision` and `engineering_units`; ENUM raw → `enum_labels`; `rate_hz` ≤ the profile's effective ceiling |
| `subscription_status` | `disconnected` marks every point stale (`mark_all_stale`) |
| `history_response` | History enabled; decimation server-side with the contract's algorithm; `timestamp_basis` matches; series ≤ `max_points_per_series` |
| `alarm_event` | Alarms enabled; state/priority in the contract; a `priority_tokens` entry exists; annunciate on `ACTIVE_UNACK` when audible |
| `action_result` | Action declared and permitted on this profile; status is a `writeStatus`, handled by `tag_write` actions; `REJECTED_INTERLOCK` carries the blocking rule and message |
| `surface_render` | Surface offered on the profile; points declared; actions split into visible/hidden per `fvts:profile-action-filter` |

A golden message may carry `"profiles": [...]` to apply to some renderers only (the setpoint write results apply to `desktop_hmi`). The OT reference set lives in `tests/governance/fvts/golden/forge-ot/` (twelve messages in eight files, rendered in name order; the renderer keeps the last good value per point across files).

### CI gate

`forge governance run fvts forge-ot-views` runs the 20 checks from the CLI (exit 1 while `fvts:hash-approved` fails). `tests/governance/fvts/test_ot_module_views.py` is the suite the reference spec declares in `conformance_tests.suite_path`. It runs the full runner and allows exactly one failure, `fvts:hash-approved`, until the owner approves the hash under FB-078. Every other FAIL, ERROR or NOT_IMPLEMENTED verdict blocks the merge.

## Specs

| Spec | Status | Notes |
|------|--------|-------|
| `forge-core.fvts.json` | approved by the owner 2026-11-21 | The hub's own screens, the first thing forge-display renders (D-16, Q-15): status and health, modules, governance, users and roles. No points; seven objects, each with a schema under `forge-core/src/python/forge_core/fxts/fvts/objects/forge-core/`. Read-only except for running a spec's checks: approving a spec and assigning a role stay off the screens until roles are enforced (FB-075). The hub is not a module and has no FACTS spec. Suite: `tests/governance/fvts/test_hub_views.py`. |
| `forge-ot.fvts.json` | `hash_state: pending_review` (FB-078) | Reference contract: fermenter HMI screen, trend, alarm summary, settings; setpoint write via two-step review. Passes every runner check except `fvts:hash-approved`; with the OT write config (`deploy/ot/ot-control.example.json`) `fvts:action-target` fails because the fermenter points are invented — FB-078 replaces them. |

## Relationship to other FxTS frameworks

| Framework | Relationship |
|-----------|--------------|
| FACTS | FVTS `owner_module` and bound adapters must exist in the module's FACTS spec |
| FATS | Endpoints serving FVTS subscriptions, history and actions are FATS-governed |
| FTTS | `grpc_stream` live updates use the FTTS transport |
| FSTS | Role, audit and PII rules for displayed data cross-check against FSTS |
| FPTS | Update-rate and history-latency budgets are verified by FPTS benchmarks |
| FHTS | Integrity hashing and agent-change governance, as for every framework |

## Decisions (confirmed by the owner on 2026-11-03, roadmap D-4)

Asked one at a time, each with a debt check (does the answer pin the framework in later?); none does. forge-display design (M4) is unblocked.

1. **Framework ID** — FVTS stays. (Was: FVTS ("View") vs another name; FDTS is taken.) Debt check: the name is in paths, runner IDs and the CI gate; renaming later would have been a sweep.
2. **`VIEWER` role** — `viewer` is the bottom rung of the D-1 ladder preset (`docs/decisions/roles.md` R-19), so FVTS's read-only role has a home in the core model. The binding itself moves from `required_role` to `required_scope` when FB-075 lands (`roles.md` §12), read-only access being the read scope. Debt check: one model, not a second read-only mapping.
3. **Write authority by profile** — confirmed: only `desktop_hmi` writes tags in v0.1.0; `desktop_app` acts through the hub's write endpoint and module commands. Debt check: write authority is data in the profile baseline, so widening it later is a profile change.
4. **Mobile alarm acknowledgement** — allowed by the baseline, with a per-site switch to turn it off; every acknowledgement records the profile it came from. Debt check: a profile flag either way; the switch avoids a per-site fork.
5. **Rate ceilings** — 20 / 10 / 4 / 1 Hz per profile confirmed as starting values, revisited with measurements from the first forge-display surfaces. Debt check: numbers in the baseline, enforced server-side.
6. **Contract encoding on the wire** — proto messages for subscription, history and action results, defined under FTTS and served over the Connect protocol (the Go tree's `connect-go`), which browsers reach over HTTP without a gRPC-Web proxy; no WebSocket or SSE side path. Debt check: one protocol for hub, modules and browsers; a second transport would have needed its own auth, versioning and tests.
7. **Configured-screen format** — a follow-on spec, not part of v0.1.0; v0.1.0 surfaces are declared, not laid out, and no interim layout file ships before that spec. Debt check: nothing to migrate when the layout spec arrives.

## Amended by the forge-display design record (owner, 2026-11-19 and 20, D-16)

`docs/decisions/forge-display.md`. Two of the decisions above are touched:

- **Item 3, write authority by profile, is replaced.** The owner's words: "No any running instance with the correct permissions can make changes to any portion of the process. ... it is how effective teams operate on the factory floor and it keeps operators mobile. They can carry a tablet or laptop around and still monitor and control processes if they need to leave the control room for any reason." Every profile may write; the user's role for that area and tag, enforced by the core, decides; a site may switch writes off for a profile; the audit records the profile each write came from. **Done 2026-11-21 (FB-178):** the profile baseline in `profiles.py` opens tag writes on all four profiles; `SitePolicy` is the per-site switch; the reference spec offers its actions on every profile. The schema needed no new version: the rule was in the baseline, not in the schema.
- **Alarm operations follow the role too.** Asked on 2026-11-21, because the baseline also limited alarm operations by device (only the control-room profile could shelve, disable or reset): the owner answered that the role decides on every profile, and that a site may switch alarm operations off for a profile as it can for writes.
- **Item 6, Connect with no WebSocket side path, stands**, confirmed by measurement on 2026-11-20 and made final by the owner, with one condition the measurement found: forge-display is always served over TLS with HTTP/2, because over plain HTTP/1.1 a browser gives only six screens their values and a write can hang (`forge-display.md` §6).

The follow-on spec of item 7, the configured-screen format, is the view document of the new framework FUTS (FB-176).
