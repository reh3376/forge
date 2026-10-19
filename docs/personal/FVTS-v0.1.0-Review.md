# FVTS v0.1.0 Draft — Review Package

**Prepared:** 15 Oct 2026 · **Status:** draft for review, not committed
**Base:** `reh3376/forge` `main` at `c186401`

This document contains every change in the FVTS (Forge View Test Specification) draft, in full, so it can be reviewed in one place. Nothing here has been committed to the repository.

## Contents

1. [[#Summary of changes]]
2. [[#1. New file — docs/FxTS/FVTS.md]]
3. [[#2. Edit — docs/FxTS/README.md]]
4. [[#3. New file — src/forge/governance/fvts/schema/fvts.schema.json]]
5. [[#4. New file — src/forge/governance/fvts/specs/ot-module.fvts.json]]
6. [[#5. New empty package files]]
7. [[#Verification performed]]

## Summary of changes

| # | Path | Change |
|---|------|--------|
| 1 | `docs/FxTS/FVTS.md` | New — framework documentation |
| 2 | `docs/FxTS/README.md` | Edit — two table rows added |
| 3 | `src/forge/governance/fvts/schema/fvts.schema.json` | New — JSON Schema (draft 2020-12) |
| 4 | `src/forge/governance/fvts/specs/ot-module.fvts.json` | New — reference spec for the OT module |
| 5 | `src/forge/governance/fvts/__init__.py`, `schema/__init__.py`, `specs/__init__.py`, `runners/__init__.py` | New — empty package markers |

No existing code is modified. No runner is included yet.

---

## 1. New file — `docs/FxTS/FVTS.md`

`````markdown
# FVTS — Forge View Test Specification

**Framework ID:** FVTS
**Full Name:** Forge View Test Specification
**CI Gate:** Hard-fail (merge-blocking) once the runner lands
**Status:** v0.1.0 DRAFT — Schema + reference spec (`ot-module.fvts.json`); runner not yet implemented
**Phase:** TBD (forge-display)
**MDEMG Analog:** None — new for forge-display

> **Name note.** FDTS ("Display") would collide with the existing FDTS (Forge *Data* Test Specification), so this framework is FVTS — "View". Rename before approval if preferred; nothing references the ID yet.

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
| **Actions** | Kind, target, role, confirmation, reason code, interlock feedback, handled statuses, audit, profiles | Tag writes need confirmation, a write-capable role, interlock feedback and all 8 WriteStatus values; audit always on |
| **Settings** | Settings schema ref, edit role, apply mode, profiles | Required fields when exposed |
| **Render profiles** | Supported profiles and tightening overrides | Overrides never loosen the baseline |
| **Surfaces** | Kind, authoring (configured/coded), scope level, profiles, points, actions | HMI screens are `configured`; every referenced point/action exists |
| **Design system** | Token set ref, ISA-101 high-performance flag | ISA-101 flag true when any surface is an `hmi_screen` |
| **Conformance tests** | Suite path, golden messages, renderers under test | Paths exist; each listed renderer passes the golden set |

## Binding to existing Forge models

FVTS does not invent parallel vocabularies. Its enums mirror the models already in the codebase, and the runner (planned check `fvts:enum-parity`) will fail if they drift:

| FVTS `$def` | Mirrors |
|-------------|---------|
| `qualityCode` | `forge.core.models.contextual_record.QualityCode` |
| `contextField` | `forge.core.models.contextual_record.RecordContext` fields |
| `timestampBasis` | `RecordTimestamp` (`source_time`, `server_time`, `ingestion_time`) |
| `alarmState`, `alarmPriority` | `forge.modules.ot.alarming.models.AlarmState` / `AlarmPriority` |
| `alarmOperation` | Operator-initiated subset of `AlarmAction` (system actions are never UI actions) |
| `role` | `forge.modules.ot.control.models.WriteRole` **plus `VIEWER`** (read-only; see open decisions) |
| `writeStatus` | `forge.modules.ot.control.models.WriteStatus` |

Live updates with `transport: grpc_stream` ride the FTTS-governed gRPC transport.

## Render profiles — normative baseline

Specs may **tighten** these (via `render_profiles.overrides`), never loosen them. Runner check `fvts:profile-baseline`.

| Profile | Intended renderer | Max update rate | Tag writes | Alarm operations | Kiosk / fullscreen | Notes |
|---------|-------------------|-----------------|------------|------------------|--------------------|-------|
| `desktop_hmi` | Operator HMI on plant-floor industrial PCs | 20 Hz | Permitted | All, per role | Yes | Must keep displaying (marked stale) through network loss |
| `desktop_app` | MES, forge-core admin, engineering tools | 10 Hz | Not permitted (v0.1.0) | ACKNOWLEDGE only | No | Settings and configuration live here |
| `web` | Remote and cross-site dashboards | 4 Hz | Not permitted | ACKNOWLEDGE only | No | Read-mostly by design |
| `mobile` | Phones and tablets | 1 Hz | Not permitted | ACKNOWLEDGE only | No | Notification-driven; reduced payloads |

Consequences enforced by the runner:

- An action's `allowed_profiles` must be a subset of `render_profiles.supported` **and** of the profiles whose baseline permits that action kind (`fvts:action-profile-permitted`).
- A surface may list actions the active profile forbids; renderers must hide them rather than disable them (`fvts:profile-action-filter`).

## Schema

**Location:** `src/forge/governance/fvts/schema/fvts.schema.json`
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
- `tag_write` actions: role ∈ {OPERATOR, ENGINEER, ADMIN}; confirmation `confirm` or `two_step_with_review`; `interlock_feedback: true`; all 8 `WriteStatus` values handled; `timeout_ms` required.
- Alarm `SHELVE`, `DISABLE` and `RESET` require a reason code.
- Every action has `audit: true`.
- `hmi_screen` surfaces are `configured` (versioned layout data), never hand-coded.
- Alarm priority tokens must live in the reserved `alarm.*` token namespace.

### Runner checks (beyond JSON Schema) — planned

| Check ID | Rule |
|----------|------|
| `fvts:schema-valid` | Spec validates against `fvts.schema.json` |
| `fvts:hash-verified` | FHTS integrity hash matches (shared) |
| `fvts:enum-parity` | Mirrored enums match the Python models listed above |
| `fvts:owner-in-facts` | `owner_module` has a FACTS spec; bound `adapter_id`s are declared there |
| `fvts:surface-refs` | Every surface point/action ID exists |
| `fvts:action-target` | `tag_write.target_point` exists and is writable in the owner's FACTS / OT write config |
| `fvts:action-profile-permitted` | Action profiles ⊆ supported profiles ∩ baseline-permitted profiles |
| `fvts:profile-baseline` | Overrides only tighten the baseline |
| `fvts:cross-site-read-only` | If `multi_site`, no `tag_write` actions are reachable from surfaces |
| `fvts:isa101-required` | `isa101_high_performance: true` when any surface is `hmi_screen` |
| `fvts:range-sane` | `range.lo < range.hi`; `reconnect.initial_backoff_ms ≤ max_backoff_ms` |
| `fvts:golden-messages` | Each `renderers_under_test` profile renders the golden message set without error |

Per FxTS principle 2 (schema-runner parity), the CI gate stays off until every schema field above is enforced by `fvts_runner.py`.

## Specs

| Spec | Status | Notes |
|------|--------|-------|
| `ot-module.fvts.json` | Draft — `hash_state: pending_review` | Reference contract: fermenter HMI screen, trend, alarm summary, settings; setpoint write via two-step review |

## Relationship to other FxTS frameworks

| Framework | Relationship |
|-----------|--------------|
| FACTS | FVTS `owner_module` and bound adapters must exist in the module's FACTS spec |
| FATS | Endpoints serving FVTS subscriptions, history and actions are FATS-governed |
| FTTS | `grpc_stream` live updates use the FTTS transport |
| FSTS | Role, audit and PII rules for displayed data cross-check against FSTS |
| FPTS | Update-rate and history-latency budgets are verified by FPTS benchmarks |
| FHTS | Integrity hashing and agent-change governance, as for every framework |

## Open decisions (to confirm before approval)

1. **Framework ID** — FVTS ("View") vs another name. FDTS is taken.
2. **`VIEWER` role** — FVTS adds it for read-only users; `WriteRole` has no equivalent. Either add it to the core role model or map read-only access elsewhere.
3. **Write authority by profile** — baseline allows tag writes only from `desktop_hmi`. Confirm `desktop_app` (e.g., MES recipe or engineering writes) should not write in v0.1.0.
4. **Mobile alarm acknowledgement** — baseline allows ACKNOWLEDGE from mobile. Some sites require acknowledgement only at the HMI.
5. **Rate ceilings** — 20 / 10 / 4 / 1 Hz per profile are starting values.
6. **Contract encoding on the wire** — proto messages for subscription, history and action results (likely under FTTS) are not yet defined.
7. **Configured-screen format** — the layout schema for `configured` surfaces (HMI screens, dashboards) is a follow-on spec, not part of v0.1.0.
`````

---

## 2. Edit — `docs/FxTS/README.md`

Two rows added; nothing else changed.

**In the "Framework Inventory" table**, after the FHTS row:

```markdown
| [FVTS](FVTS.md) | Forge View Test Specification | Module ↔ forge-display contract: bindings, alarms, actions, surfaces, render profiles | Hard-fail (once runner lands) | Draft — schema + reference spec |
```

**In the "Relationship to UxTS (MDEMG)" table**, after the FLTS row:

```markdown
| (new) | FVTS | No UxTS analog — new for forge-display view contracts |
```

---

## 3. New file — `src/forge/governance/fvts/schema/fvts.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "forge://governance/fvts/v0.1.0",
  "title": "Forge View Test Specification (FVTS)",
  "description": "Governs the contract between Forge modules and forge-display. A module never renders UI; it declares what can be shown (data bindings, history, alarms), what can be done (actions, settings) and on which surfaces and render profiles. forge-display renderers (desktop HMI, desktop app, web, mobile) consume this contract. One FVTS spec per module.",
  "type": "object",
  "required": [
    "spec_version",
    "view_identity",
    "scope",
    "data_bindings",
    "live_updates",
    "history",
    "alarms",
    "actions",
    "settings",
    "render_profiles",
    "surfaces",
    "design_system",
    "conformance_tests"
  ],
  "additionalProperties": false,
  "properties": {
    "spec_version": {
      "type": "string",
      "const": "0.1.0",
      "description": "FVTS schema version this spec conforms to. Must match exactly."
    },
    "view_identity": {
      "type": "object",
      "description": "Identifies the module's view contract.",
      "required": ["view_id", "name", "version", "owner_module"],
      "additionalProperties": false,
      "properties": {
        "view_id": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$",
          "minLength": 3,
          "maxLength": 64,
          "description": "Unique view-contract identifier (kebab-case)."
        },
        "name": { "type": "string", "minLength": 1, "maxLength": 128 },
        "version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+",
          "description": "Semver version of this view contract. A breaking change to any binding, action or surface requires a major bump."
        },
        "owner_module": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$",
          "description": "module/adapter_id of the module that owns this contract (matches its FACTS adapter_identity.adapter_id)."
        },
        "facts_spec_ref": {
          "type": "string",
          "description": "Path or forge:// URI of the owning module's FACTS spec. Data sources bound here must be declared there."
        },
        "description": { "type": "string" }
      }
    },
    "scope": {
      "type": "object",
      "description": "Where in the plant hierarchy this contract's views apply, and which RecordContext fields every view must carry.",
      "required": ["isa95_levels", "required_context_fields"],
      "additionalProperties": false,
      "properties": {
        "isa95_levels": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "$ref": "#/$defs/isa95Level" },
          "description": "ISA-95 hierarchy levels a view can be scoped to."
        },
        "required_context_fields": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "$ref": "#/$defs/contextField" },
          "description": "RecordContext fields that must be present on every bound value (e.g. site, area, equipment_id)."
        },
        "multi_site": {
          "type": "boolean",
          "default": false,
          "description": "True if a single view may aggregate data across sites. Cross-site views are read-only (runner check fvts:cross-site-read-only)."
        }
      }
    },
    "data_bindings": {
      "type": "object",
      "description": "Every value a renderer may display. Renderers may only bind to points declared here.",
      "required": ["points"],
      "additionalProperties": false,
      "properties": {
        "points": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/point" }
        }
      }
    },
    "live_updates": {
      "type": "object",
      "description": "Subscription contract for live values.",
      "required": ["transport", "max_update_rate_hz", "heartbeat_ms", "on_disconnect", "coalescing"],
      "additionalProperties": false,
      "properties": {
        "transport": {
          "type": "string",
          "enum": ["grpc_stream", "websocket", "sse"],
          "description": "Wire mechanism from forge-core to the renderer. grpc_stream rides the FTTS-governed transport."
        },
        "max_update_rate_hz": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 20,
          "description": "Upper bound on per-point update rate delivered to any renderer. Profiles may lower it, never raise it."
        },
        "coalescing": {
          "type": "string",
          "const": "latest_wins",
          "description": "When updates exceed the rate, only the most recent value per point is delivered."
        },
        "heartbeat_ms": {
          "type": "integer",
          "minimum": 250,
          "maximum": 30000,
          "description": "Max interval between messages on an idle subscription; missing heartbeats trigger on_disconnect."
        },
        "on_disconnect": {
          "type": "string",
          "const": "mark_all_stale",
          "description": "On loss of the subscription every displayed value must be visibly marked stale. Never silently freeze."
        },
        "reconnect": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "initial_backoff_ms": { "type": "integer", "minimum": 100 },
            "max_backoff_ms": { "type": "integer", "minimum": 1000 }
          }
        }
      }
    },
    "history": {
      "type": "object",
      "description": "Trend/history query contract.",
      "required": ["enabled"],
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "decimation": {
          "type": "object",
          "required": ["location", "algorithm"],
          "additionalProperties": false,
          "properties": {
            "location": {
              "type": "string",
              "const": "server",
              "description": "Decimation always happens server-side; renderers never receive raw full-resolution series."
            },
            "algorithm": {
              "type": "string",
              "enum": ["min_max_per_bucket", "lttb", "average_per_bucket"],
              "description": "min_max_per_bucket preserves spikes and is the default for process trends."
            }
          }
        },
        "max_points_per_series": {
          "type": "integer",
          "minimum": 100,
          "maximum": 20000,
          "description": "Hard cap on points returned per series per query."
        },
        "max_range_days": { "type": "integer", "minimum": 1 },
        "as_of_queries": {
          "type": "boolean",
          "description": "Supports bitemporal as-of queries (what was known at transaction time T)."
        },
        "timestamp_basis": { "$ref": "#/$defs/timestampBasis" }
      },
      "if": { "properties": { "enabled": { "const": true } } },
      "then": { "required": ["decimation", "max_points_per_series", "max_range_days", "timestamp_basis"] }
    },
    "alarms": {
      "type": "object",
      "description": "Alarm presentation and operator-operation contract. Alarm logic lives in the owning module (ISA-18.2 state machine); this governs how it is shown and operated.",
      "required": ["enabled"],
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "states": {
          "type": "array",
          "uniqueItems": true,
          "minItems": 7,
          "items": { "$ref": "#/$defs/alarmState" },
          "description": "Must cover every AlarmState so no state is unrenderable."
        },
        "priorities": {
          "type": "array",
          "uniqueItems": true,
          "minItems": 1,
          "items": { "$ref": "#/$defs/alarmPriority" }
        },
        "priority_tokens": {
          "type": "object",
          "description": "Design-system token for each priority. Alarm tokens are reserved: they may not be used for non-alarm content.",
          "propertyNames": { "$ref": "#/$defs/alarmPriority" },
          "additionalProperties": { "type": "string", "pattern": "^alarm\\.[a-z0-9.-]+$" }
        },
        "audible_annunciation": {
          "type": "boolean",
          "description": "Whether renderers that support sound must annunciate new ACTIVE_UNACK alarms."
        }
      },
      "if": { "properties": { "enabled": { "const": true } } },
      "then": { "required": ["states", "priorities", "priority_tokens", "audible_annunciation"] }
    },
    "actions": {
      "type": "array",
      "description": "Everything a user can do from a view. Safety behaviour (role, confirmation, interlocks, audit) is declared here and enforced in forge-core, never only in the UI.",
      "items": { "$ref": "#/$defs/action" }
    },
    "settings": {
      "type": "object",
      "description": "Module configuration exposed for editing. Forms are generated from the referenced JSON Schema.",
      "required": ["exposed"],
      "additionalProperties": false,
      "properties": {
        "exposed": { "type": "boolean" },
        "schema_ref": { "type": "string", "description": "forge:// URI or path to the JSON Schema of the module's settings." },
        "required_role": { "$ref": "#/$defs/role" },
        "apply_mode": {
          "type": "string",
          "enum": ["immediate", "staged_with_review"],
          "description": "staged_with_review: edits are saved as a pending change set that a second authorized user applies."
        },
        "allowed_profiles": { "$ref": "#/$defs/profileList" }
      },
      "if": { "properties": { "exposed": { "const": true } } },
      "then": { "required": ["schema_ref", "required_role", "apply_mode", "allowed_profiles"] }
    },
    "render_profiles": {
      "type": "object",
      "description": "Which forge-display render profiles this module supports, and any tightening of the platform baseline (see FVTS.md). Specs may tighten a baseline, never loosen it.",
      "required": ["supported"],
      "additionalProperties": false,
      "properties": {
        "supported": {
          "$ref": "#/$defs/profileList"
        },
        "overrides": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/profile" },
          "additionalProperties": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "max_update_rate_hz": { "type": "number", "exclusiveMinimum": 0 },
              "writes_permitted": { "type": "boolean" },
              "alarm_operations_permitted": { "type": "boolean" }
            }
          }
        }
      }
    },
    "surfaces": {
      "type": "array",
      "minItems": 1,
      "description": "The screens/views this module offers. Configured surfaces are data authored per site; coded surfaces are application code. Both may only use declared points and actions.",
      "items": { "$ref": "#/$defs/surface" }
    },
    "design_system": {
      "type": "object",
      "required": ["tokens_ref", "isa101_high_performance"],
      "additionalProperties": false,
      "properties": {
        "tokens_ref": {
          "type": "string",
          "description": "forge:// URI of the platform design-token set this contract's surfaces use."
        },
        "isa101_high_performance": {
          "type": "boolean",
          "description": "True: surfaces follow ISA-101 high-performance HMI style (neutral base, colour reserved for abnormal states). Required true when any surface is an hmi_screen."
        }
      }
    },
    "conformance_tests": {
      "type": "object",
      "description": "Declares the test suite that validates this contract.",
      "required": ["suite_path"],
      "additionalProperties": false,
      "properties": {
        "suite_path": { "type": "string" },
        "golden_messages_path": {
          "type": "string",
          "description": "Directory of golden contract messages (subscription, history, alarm, action result) every renderer must accept."
        },
        "renderers_under_test": { "$ref": "#/$defs/profileList" }
      }
    },
    "metadata": {
      "type": "object",
      "description": "Free-form metadata (no schema validation)."
    },
    "integrity": {
      "type": "object",
      "description": "FHTS Layer 1 integrity block — hash governance.",
      "properties": {
        "hash_method": { "type": "string" },
        "spec_hash": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
        "hash_state": {
          "type": "string",
          "enum": ["approved", "modified", "pending_review", "reverted", "unknown"]
        },
        "previous_hash": { "type": ["string", "null"] },
        "approved_by": { "type": ["string", "null"] },
        "approved_at": { "type": ["string", "null"] },
        "change_history": {
          "type": "array",
          "maxItems": 3,
          "items": {
            "type": "object",
            "required": ["previous_hash", "new_hash", "changed_at"],
            "properties": {
              "previous_hash": { "type": "string" },
              "new_hash": { "type": "string" },
              "changed_at": { "type": "string" },
              "source": { "type": "string" },
              "changed_by": { "type": "string" },
              "change_type": { "type": "string" },
              "reason": { "type": "string" }
            }
          }
        }
      }
    }
  },
  "$defs": {
    "isa95Level": {
      "type": "string",
      "enum": ["enterprise", "site", "area", "line", "cell", "equipment"]
    },
    "contextField": {
      "type": "string",
      "description": "Mirrors forge.core.models.contextual_record.RecordContext.",
      "enum": ["site", "area", "equipment_id", "batch_id", "lot_id", "recipe_id", "operating_mode", "shift", "operator_id"]
    },
    "timestampBasis": {
      "type": "string",
      "description": "Which RecordTimestamp field a renderer displays and trends against.",
      "enum": ["source_time", "server_time", "ingestion_time"]
    },
    "qualityCode": {
      "type": "string",
      "description": "Mirrors forge.core.models.contextual_record.QualityCode.",
      "enum": ["GOOD", "UNCERTAIN", "BAD", "NOT_AVAILABLE"]
    },
    "alarmState": {
      "type": "string",
      "description": "Mirrors forge.modules.ot.alarming.models.AlarmState.",
      "enum": ["NORMAL", "ACTIVE_UNACK", "ACTIVE_ACK", "CLEAR_UNACK", "SUPPRESSED", "SHELVED", "OUT_OF_SERVICE"]
    },
    "alarmPriority": {
      "type": "string",
      "description": "Mirrors forge.modules.ot.alarming.models.AlarmPriority.",
      "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "DIAGNOSTIC"]
    },
    "alarmOperation": {
      "type": "string",
      "description": "Operator-initiated subset of AlarmAction. System actions (TRIGGER, CLEAR, SUPPRESS, UNSUPPRESS) are never exposed as UI actions.",
      "enum": ["ACKNOWLEDGE", "SHELVE", "UNSHELVE", "DISABLE", "ENABLE", "RESET"]
    },
    "role": {
      "type": "string",
      "description": "Mirrors forge.modules.ot.control.models.WriteRole (hierarchy ADMIN > ENGINEER > OPERATOR), plus VIEWER for read-only access.",
      "enum": ["VIEWER", "OPERATOR", "ENGINEER", "ADMIN"]
    },
    "writeStatus": {
      "type": "string",
      "description": "Mirrors forge.modules.ot.control.models.WriteStatus.",
      "enum": ["CONFIRMED", "UNCONFIRMED", "REJECTED_VALIDATION", "REJECTED_INTERLOCK", "REJECTED_AUTH", "FAILED_WRITE", "FAILED_READBACK", "PENDING"]
    },
    "profile": {
      "type": "string",
      "description": "forge-display render profile. Baseline constraints per profile are defined normatively in FVTS.md.",
      "enum": ["desktop_hmi", "desktop_app", "web", "mobile"]
    },
    "profileList": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "$ref": "#/$defs/profile" }
    },
    "point": {
      "type": "object",
      "required": ["point_id", "label", "source", "data_type", "timestamp_basis", "quality_handling"],
      "additionalProperties": false,
      "properties": {
        "point_id": { "type": "string", "pattern": "^[a-z][a-z0-9_.-]*$", "maxLength": 128 },
        "label": { "type": "string", "minLength": 1 },
        "source": {
          "type": "object",
          "required": ["adapter_id", "tag_path"],
          "additionalProperties": false,
          "properties": {
            "adapter_id": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
            "tag_path": {
              "type": "string",
              "description": "RecordSource.tag_path. May contain {placeholders} resolved from scope context (e.g. {area}/{equipment_id}/Temperature)."
            }
          }
        },
        "data_type": {
          "type": "string",
          "enum": ["BOOLEAN", "INT", "FLOAT", "DOUBLE", "STRING", "DATETIME", "ENUM"]
        },
        "engineering_units": { "type": "string" },
        "display_precision": { "type": "integer", "minimum": 0, "maximum": 9 },
        "range": {
          "type": "object",
          "required": ["lo", "hi"],
          "additionalProperties": false,
          "properties": { "lo": { "type": "number" }, "hi": { "type": "number" } },
          "description": "Normal display/scale range. Not an interlock — interlocks live in the owning module."
        },
        "enum_labels": {
          "type": "object",
          "additionalProperties": { "type": "string" },
          "description": "Required when data_type is ENUM: raw value -> display label."
        },
        "timestamp_basis": { "$ref": "#/$defs/timestampBasis" },
        "quality_handling": {
          "type": "object",
          "required": ["stale_after_ms", "on_bad", "on_uncertain"],
          "additionalProperties": false,
          "properties": {
            "stale_after_ms": {
              "type": "integer",
              "minimum": 100,
              "description": "A value older than this (by timestamp_basis) is displayed as stale."
            },
            "on_bad": {
              "type": "string",
              "enum": ["blank_with_marker", "last_value_with_marker"],
              "description": "BAD and NOT_AVAILABLE presentation. A bad value is never shown without a marker."
            },
            "on_uncertain": {
              "type": "string",
              "enum": ["value_with_marker"],
              "description": "UNCERTAIN is always shown with a marker."
            }
          }
        }
      },
      "allOf": [
        {
          "if": { "properties": { "data_type": { "const": "ENUM" } } },
          "then": { "required": ["enum_labels"] }
        },
        {
          "if": { "properties": { "data_type": { "enum": ["INT", "FLOAT", "DOUBLE"] } } },
          "then": { "required": ["engineering_units", "display_precision"] }
        }
      ]
    },
    "action": {
      "type": "object",
      "required": ["action_id", "label", "kind", "required_role", "confirmation", "audit", "allowed_profiles"],
      "additionalProperties": false,
      "properties": {
        "action_id": { "type": "string", "pattern": "^[a-z][a-z0-9_.-]*$", "maxLength": 128 },
        "label": { "type": "string", "minLength": 1 },
        "kind": {
          "type": "string",
          "enum": ["tag_write", "alarm_operation", "module_command"]
        },
        "target_point": {
          "type": "string",
          "description": "point_id written by a tag_write action."
        },
        "alarm_operation": { "$ref": "#/$defs/alarmOperation" },
        "command": {
          "type": "string",
          "description": "Module command name for module_command actions (must exist in the module's FATS/FACTS contract)."
        },
        "parameters_schema_ref": {
          "type": "string",
          "description": "JSON Schema for command parameters; renderers generate the input form from it."
        },
        "required_role": { "$ref": "#/$defs/role" },
        "confirmation": {
          "type": "string",
          "enum": ["none", "confirm", "two_step_with_review"],
          "description": "two_step_with_review: user enters value, then reviews old vs new value and confirms. Enforced by forge-core, not only drawn by the UI."
        },
        "reason_code_required": { "type": "boolean", "default": false },
        "interlock_feedback": {
          "type": "boolean",
          "description": "Renderer must display interlock rejections (REJECTED_INTERLOCK) with the blocking condition."
        },
        "handled_statuses": {
          "type": "array",
          "uniqueItems": true,
          "items": { "$ref": "#/$defs/writeStatus" },
          "description": "For tag_write: every WriteStatus the renderer must present distinctly."
        },
        "timeout_ms": { "type": "integer", "minimum": 100 },
        "audit": {
          "type": "boolean",
          "const": true,
          "description": "Every UI action is audited (who, what, old/new value, reason, profile, site)."
        },
        "allowed_profiles": { "$ref": "#/$defs/profileList" }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "tag_write" } } },
          "then": {
            "required": ["target_point", "interlock_feedback", "handled_statuses", "timeout_ms"],
            "properties": {
              "required_role": { "enum": ["OPERATOR", "ENGINEER", "ADMIN"] },
              "confirmation": { "enum": ["confirm", "two_step_with_review"] },
              "interlock_feedback": { "const": true },
              "handled_statuses": { "minItems": 8 }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "alarm_operation" } } },
          "then": { "required": ["alarm_operation"] }
        },
        {
          "if": { "properties": { "kind": { "const": "module_command" } } },
          "then": { "required": ["command", "timeout_ms"] }
        },
        {
          "if": { "properties": { "alarm_operation": { "enum": ["SHELVE", "DISABLE", "RESET"] } }, "required": ["alarm_operation"] },
          "then": { "properties": { "reason_code_required": { "const": true } }, "required": ["reason_code_required"] }
        }
      ]
    },
    "surface": {
      "type": "object",
      "required": ["surface_id", "title", "kind", "authoring", "allowed_profiles", "points", "actions"],
      "additionalProperties": false,
      "properties": {
        "surface_id": { "type": "string", "pattern": "^[a-z][a-z0-9_.-]*$", "maxLength": 128 },
        "title": { "type": "string", "minLength": 1 },
        "kind": {
          "type": "string",
          "enum": ["hmi_screen", "dashboard", "trend", "alarm_summary", "form", "app_view", "settings"]
        },
        "authoring": {
          "type": "string",
          "enum": ["configured", "coded"],
          "description": "configured: layout is versioned data authored per site; coded: application code driven by this contract."
        },
        "scope_level": { "$ref": "#/$defs/isa95Level" },
        "allowed_profiles": { "$ref": "#/$defs/profileList" },
        "points": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string" },
          "description": "point_ids this surface may bind. Must exist in data_bindings."
        },
        "actions": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string" },
          "description": "action_ids this surface may invoke. Must exist in actions."
        }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "hmi_screen" } } },
          "then": { "properties": { "authoring": { "const": "configured" } } }
        }
      ]
    }
  }
}
```

---

## 4. New file — `src/forge/governance/fvts/specs/ot-module.fvts.json`

The `integrity` block was computed with the repo's own `add_spec_hash()` (`sha256-c14n-v1`) and then set to `hash_state: pending_review` with no approver, because the spec is agent-authored. **Any edit to this file invalidates the hash** — re-stamp with your FHTS tooling after review.

```json
{
  "spec_version": "0.1.0",
  "view_identity": {
    "view_id": "ot-module-views",
    "name": "Forge OT/SCADA Module — Operator Views",
    "version": "0.1.0",
    "owner_module": "ot-module",
    "facts_spec_ref": "src/forge/governance/facts/specs/ot-module.facts.json",
    "description": "Reference FVTS contract: operator HMI, trending and alarm summary for the OT module. Exercises every FVTS section, including the write path through the OT module's four-layer write engine."
  },
  "scope": {
    "isa95_levels": [
      "site",
      "area",
      "equipment"
    ],
    "required_context_fields": [
      "site",
      "area",
      "equipment_id",
      "operating_mode"
    ],
    "multi_site": false
  },
  "data_bindings": {
    "points": [
      {
        "point_id": "ferm.temperature",
        "label": "Fermenter temperature",
        "source": {
          "adapter_id": "ot-module",
          "tag_path": "{area}/{equipment_id}/Temperature"
        },
        "data_type": "FLOAT",
        "engineering_units": "°F",
        "display_precision": 1,
        "range": {
          "lo": 32,
          "hi": 212
        },
        "timestamp_basis": "source_time",
        "quality_handling": {
          "stale_after_ms": 5000,
          "on_bad": "blank_with_marker",
          "on_uncertain": "value_with_marker"
        }
      },
      {
        "point_id": "ferm.temperature_sp",
        "label": "Temperature setpoint",
        "source": {
          "adapter_id": "ot-module",
          "tag_path": "{area}/{equipment_id}/TemperatureSP"
        },
        "data_type": "FLOAT",
        "engineering_units": "°F",
        "display_precision": 1,
        "range": {
          "lo": 32,
          "hi": 212
        },
        "timestamp_basis": "source_time",
        "quality_handling": {
          "stale_after_ms": 5000,
          "on_bad": "last_value_with_marker",
          "on_uncertain": "value_with_marker"
        }
      },
      {
        "point_id": "ferm.agitator_running",
        "label": "Agitator running",
        "source": {
          "adapter_id": "ot-module",
          "tag_path": "{area}/{equipment_id}/Agitator/Running"
        },
        "data_type": "BOOLEAN",
        "timestamp_basis": "source_time",
        "quality_handling": {
          "stale_after_ms": 5000,
          "on_bad": "blank_with_marker",
          "on_uncertain": "value_with_marker"
        }
      },
      {
        "point_id": "ferm.mode",
        "label": "Operating mode",
        "source": {
          "adapter_id": "ot-module",
          "tag_path": "{area}/{equipment_id}/Mode"
        },
        "data_type": "ENUM",
        "enum_labels": {
          "0": "Idle",
          "1": "Startup",
          "2": "Production",
          "3": "CIP"
        },
        "timestamp_basis": "source_time",
        "quality_handling": {
          "stale_after_ms": 5000,
          "on_bad": "blank_with_marker",
          "on_uncertain": "value_with_marker"
        }
      }
    ]
  },
  "live_updates": {
    "transport": "grpc_stream",
    "max_update_rate_hz": 4,
    "coalescing": "latest_wins",
    "heartbeat_ms": 2000,
    "on_disconnect": "mark_all_stale",
    "reconnect": {
      "initial_backoff_ms": 500,
      "max_backoff_ms": 15000
    }
  },
  "history": {
    "enabled": true,
    "decimation": {
      "location": "server",
      "algorithm": "min_max_per_bucket"
    },
    "max_points_per_series": 4000,
    "max_range_days": 90,
    "as_of_queries": true,
    "timestamp_basis": "source_time"
  },
  "alarms": {
    "enabled": true,
    "states": [
      "NORMAL",
      "ACTIVE_UNACK",
      "ACTIVE_ACK",
      "CLEAR_UNACK",
      "SUPPRESSED",
      "SHELVED",
      "OUT_OF_SERVICE"
    ],
    "priorities": [
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "LOW",
      "DIAGNOSTIC"
    ],
    "priority_tokens": {
      "CRITICAL": "alarm.critical",
      "HIGH": "alarm.high",
      "MEDIUM": "alarm.medium",
      "LOW": "alarm.low",
      "DIAGNOSTIC": "alarm.diagnostic"
    },
    "audible_annunciation": true
  },
  "actions": [
    {
      "action_id": "ferm.write_temperature_sp",
      "label": "Change temperature setpoint",
      "kind": "tag_write",
      "target_point": "ferm.temperature_sp",
      "required_role": "OPERATOR",
      "confirmation": "two_step_with_review",
      "reason_code_required": false,
      "interlock_feedback": true,
      "handled_statuses": [
        "CONFIRMED",
        "UNCONFIRMED",
        "REJECTED_VALIDATION",
        "REJECTED_INTERLOCK",
        "REJECTED_AUTH",
        "FAILED_WRITE",
        "FAILED_READBACK",
        "PENDING"
      ],
      "timeout_ms": 5000,
      "audit": true,
      "allowed_profiles": [
        "desktop_hmi"
      ]
    },
    {
      "action_id": "alarm.acknowledge",
      "label": "Acknowledge alarm",
      "kind": "alarm_operation",
      "alarm_operation": "ACKNOWLEDGE",
      "required_role": "OPERATOR",
      "confirmation": "none",
      "audit": true,
      "allowed_profiles": [
        "desktop_hmi",
        "web",
        "mobile"
      ]
    },
    {
      "action_id": "alarm.shelve",
      "label": "Shelve alarm",
      "kind": "alarm_operation",
      "alarm_operation": "SHELVE",
      "required_role": "ENGINEER",
      "confirmation": "confirm",
      "reason_code_required": true,
      "audit": true,
      "allowed_profiles": [
        "desktop_hmi"
      ]
    }
  ],
  "settings": {
    "exposed": true,
    "schema_ref": "forge://schemas/ot-module/settings/v1",
    "required_role": "ENGINEER",
    "apply_mode": "staged_with_review",
    "allowed_profiles": [
      "desktop_app"
    ]
  },
  "render_profiles": {
    "supported": [
      "desktop_hmi",
      "desktop_app",
      "web",
      "mobile"
    ],
    "overrides": {
      "mobile": {
        "max_update_rate_hz": 1
      }
    }
  },
  "surfaces": [
    {
      "surface_id": "ferm.overview",
      "title": "Fermenter overview",
      "kind": "hmi_screen",
      "authoring": "configured",
      "scope_level": "equipment",
      "allowed_profiles": [
        "desktop_hmi",
        "web"
      ],
      "points": [
        "ferm.temperature",
        "ferm.temperature_sp",
        "ferm.agitator_running",
        "ferm.mode"
      ],
      "actions": [
        "ferm.write_temperature_sp",
        "alarm.acknowledge",
        "alarm.shelve"
      ]
    },
    {
      "surface_id": "ferm.trend",
      "title": "Fermenter temperature trend",
      "kind": "trend",
      "authoring": "configured",
      "scope_level": "equipment",
      "allowed_profiles": [
        "desktop_hmi",
        "desktop_app",
        "web",
        "mobile"
      ],
      "points": [
        "ferm.temperature",
        "ferm.temperature_sp"
      ],
      "actions": []
    },
    {
      "surface_id": "area.alarm_summary",
      "title": "Area alarm summary",
      "kind": "alarm_summary",
      "authoring": "coded",
      "scope_level": "area",
      "allowed_profiles": [
        "desktop_hmi",
        "web",
        "mobile"
      ],
      "points": [],
      "actions": [
        "alarm.acknowledge",
        "alarm.shelve"
      ]
    },
    {
      "surface_id": "ot.settings",
      "title": "OT module settings",
      "kind": "settings",
      "authoring": "coded",
      "allowed_profiles": [
        "desktop_app"
      ],
      "points": [],
      "actions": []
    }
  ],
  "design_system": {
    "tokens_ref": "forge://design/tokens/v1",
    "isa101_high_performance": true
  },
  "conformance_tests": {
    "suite_path": "tests/governance/fvts/test_ot_module_views.py",
    "golden_messages_path": "tests/governance/fvts/golden/ot-module/",
    "renderers_under_test": [
      "desktop_hmi",
      "web"
    ]
  },
  "metadata": {
    "status": "draft",
    "notes": "Reference spec for FVTS v0.1.0. Point paths follow the ContextualRecord example (Area1/Fermenter3/Temperature, FERM-003). Surfaces may list actions the active profile forbids; renderers hide them (fvts:profile-action-filter)."
  },
  "integrity": {
    "hash_state": "pending_review",
    "previous_hash": null,
    "change_history": [
      {
        "previous_hash": "",
        "new_hash": "d2344754a70a9b501267ca7cdc42be89b10bd576503f8640a32d9e83f926d179",
        "changed_at": "2026-10-15T21:45:00Z",
        "source": "agent",
        "changed_by": "claude-opus-5-5",
        "change_type": "initial",
        "reason": "Initial FVTS v0.1.0 reference spec for forge-display contract; awaiting approval by reh3376."
      }
    ],
    "hash_method": "sha256-c14n-v1",
    "spec_hash": "d2344754a70a9b501267ca7cdc42be89b10bd576503f8640a32d9e83f926d179",
    "approved_by": null,
    "approved_at": null
  }
}
```

---

## 5. New empty package files

These four files are empty (zero bytes). They make the new directories Python packages, matching the layout of the other FxTS frameworks:

```text
src/forge/governance/fvts/__init__.py
src/forge/governance/fvts/schema/__init__.py
src/forge/governance/fvts/specs/__init__.py
src/forge/governance/fvts/runners/__init__.py
```

---

## Verification performed

- `fvts.schema.json` passes `jsonschema` Draft 2020-12 `check_schema`.
- `ot-module.fvts.json` validates against the schema.
- Every point and action referenced by a surface exists; every action's profiles are within the supported profiles.
- 14 deliberately unsafe variants of the spec were rejected by the schema, including: a tag write with no confirmation, a tag write by `VIEWER`, missing interlock feedback, handling only `CONFIRMED`, shelving without a reason code, `audit: false`, client-side decimation, freezing on disconnect, a missing alarm state, a hand-coded `hmi_screen`, a numeric point without units, an `ENUM` without labels, a non-alarm colour token for an alarm priority, and an unknown top-level key.
- `verify_spec_hash()` confirms the spec's integrity hash.
- The existing `tests/governance` suite shows the same result with and without these changes (374 passed, 33 failed — the failures are pre-existing).

