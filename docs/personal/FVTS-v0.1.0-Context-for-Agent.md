---
title: FVTS v0.1.0 — Decision Context for AI Coding Agent
created: 2026-10-15
audience: AI coding agent working in reh3376/forge
companion: FVTS-v0.1.0-Review.md
status: draft — to be reviewed and amended by Roger (reh3376) before use
---

# FVTS v0.1.0 — Decision Context for AI Coding Agent

## 0. How to use this document

You are about to review, and possibly implement, the **FVTS (Forge View Test Specification)** draft contained in the companion file `FVTS-v0.1.0-Review.md`. This document gives you the context that produced that draft: what Roger asked for, what was found in the repository, what was proposed, why, and what is still undecided.

The draft was written by Claude (Anthropic, model `claude-opus-5-5`) in a chat session on 15 Oct 2026. Roger has reviewed this document and may have amended it; **where Roger's amendments conflict with anything else here, Roger's amendments win.**

### Provenance tags

Every substantive statement below carries one of these tags. Treat them differently.

| Tag | Meaning | How to treat it |
|-----|---------|-----------------|
| **[USER]** | Roger stated it in the session or in earlier saved project notes | Authoritative intent. Do not change without asking Roger. |
| **[REPO]** | Observed directly in `reh3376/forge` (`main` at `c186401`, 15 Oct 2026) | Fact as of that commit. Re-verify; the repo moves. |
| **[PROPOSED]** | Claude's design choice in the draft | Not approved. Challenge it if the codebase or Roger's intent says otherwise. |
| **[PLACEHOLDER]** | A value chosen only so the schema/spec is complete | Expect it to change. Never treat as a requirement. |
| **[UNVERIFIED]** | Claude believed it but did not confirm it | Verify before relying on it. |

### Ground rules for the agent

1. **FxTS is spec-first.** Specs are the source of truth; code conforms to specs [REPO: `docs/FxTS/README.md`]. Do not edit a spec to make code pass.
2. **Do not approve integrity hashes.** The reference spec is `hash_state: pending_review`. Only Roger approves (`approved_by: reh3376`).
3. **Schema-runner parity is mandatory** [REPO]: every schema field must be enforced by the runner, or the runner hard-fails. The FVTS CI gate must stay off until `fvts_runner.py` enforces every field.
4. **Architecture decisions are confirmed before implementation** [USER: established working pattern]. Items in §7 (Open decisions) are not decided — ask, don't assume.
5. **Branch and PR rules**: All changes go through a PR that Roger reviews; never write to `main` [USER]. The saved rule says to write to `reh3376/dev00`, but on 15 Oct 2026 `reh3376/dev00`'s last commit was 16 Apr 2026 while `reh3376_dev01` had just been merged into `main` [REPO]. **Ask Roger which branch to use.**
6. Roger will add and commit FVTS himself after review [USER]. Do not commit FVTS files unless Roger asks.

---

## 1. Background — how this started

The FVTS draft came out of a single conversation that moved through four stages.

### 1.1 Frontend framework research (Rust and Go)

[USER] Roger asked for a survey of Rust frontend frameworks (he knew of Topcoat) and the best two in depth, then the same for Go. Two Obsidian notes were produced:

- `Rust Frontend Frameworks.md` — top picks for **web** work: Leptos (#1), Dioxus (#2); Topcoat (Tokio project, server-rendered, released Jul 2026, v0.9 Sep 2026) as an honorable mention; GPU/canvas toolkits (Slint, egui, Iced, Makepad, Xilem, GPUI) listed as secondary.
- `Go Frontend Frameworks.md` — top picks: templ (+ HTMX or Datastar), go-app (WebAssembly).

These notes ranked frameworks **for web apps**. That ranking does not transfer directly to Forge's display needs (see §1.3).

### 1.2 Forge language concern

[USER] Roger said:

- Forge "is currently using Go"; he worries Rust may be the better long-term choice as deployments scale to **multi-site enterprise**.
- He expects Rust to become the dominant ML/AI language, with a migration off Python "likely in the coming years."
- forge-core would be better served by a **desktop GUI/shell** than a browser-driven UI.
- forge needs a **display module** that creates all frontends for the core and modules.
- Visibility requirements vary widely: the **HMI/SCADA module** needs "rock solid" operator HMI screens, dashboards and trending; **forge-mes** has very different needs and is likely best as a desktop GUI.

HMI = Human-Machine Interface (operator screens). SCADA = Supervisory Control and Data Acquisition. MES = Manufacturing Execution System. GUI = Graphical User Interface.

[PROPOSED] Claude's response, summarised:

- Scaling to multi-site is mostly an **architecture** problem (site autonomy, store-and-forward, replication, schema/version skew, bitemporal queries), not a language problem.
- Rust's real advantages for Forge: no garbage-collector pauses, small edge devices near PLCs (programmable logic controllers), in-process ML inference, and a much stronger native-UI ecosystem than Go.
- Pushback on "full migration off Python": Rust is winning the systems layer *under* Python (tokenizers, Polars, pydantic-core, uv, Ruff, inference runtimes), but training/research remains Python. Forge already reaches models via OpenAI-compatible endpoints (llama-server), so the ML language is behind a network boundary and need not drive Forge's language.
- Three paths for the core: stay Go; **polyglot by protocol** (Rust for the display module and latency-critical edge pieces, talking to the core over the transport); or a full Rust migration (cheapest now, while pre-production). Claude leaned to polyglot by protocol.
- For forge's display needs specifically, the Rust ranking changes: **Slint** or **egui** for operator HMI and trending, **Dioxus** for MES/core desktop apps plus a browser build for remote dashboards. [UNVERIFIED] Slint's license tiers (GPL, royalty-free, commercial for embedded) must be checked before committing.
- Scope warning: operator-grade HMI is the area where products like Ignition and AVEVA have decades of investment; decide early whether Forge's HMI **replaces** existing SCADA displays or sits **alongside** them as an advisory/analytics layer. **Roger has not answered this** (see §7).

### 1.3 What forge-display must cover

[USER] "The forge-display module will be how all user displays will be built from forge-core, settings, modules, interactive screens HMIs, dashboards, etc… it's a long list that will include mobile applications and browser UIs sitting beside desktop GUIs." Roger asked what to do now to prepare.

[PROPOSED] Claude's preparation list, which FVTS encodes:

1. **Modules describe, display renders** — modules never render UI; they publish a declarative manifest.
2. **Build the data plane renderers need**: live subscriptions with quality and timestamps; history with server-side decimation; an alarm/event stream; a command/write path whose safety lives in the core.
3. **Separate configured screens** (HMI, dashboards — versioned layout data) from **coded screens** (MES workflows, admin).
4. **Render capability profiles** per display type (desktop HMI, desktop app, web, mobile).
5. **Framework-neutral design system** — tokens, reserved alarm colors (ISA-101 style), component catalog defined by behavior.
6. **Model plant context and cross-cutting concerns early** — ISA-95 hierarchy, site-scoped roles, units, time zones, locale.
7. **Prove the contract with a throwaway spike** rendering one slice in two very different renderers, plus golden-message conformance tests.
8. **Record as locked decisions.**

### 1.4 "Use FxTS to lock this down"

[USER] "We should use the FxTS framework to lock this down." Claude then read the repository and drafted FVTS as a new FxTS framework (schema + reference spec + doc). [USER] Roger then asked that nothing be committed; he will review, modify and commit himself.

---

## 2. Repository facts that shaped the draft

All [REPO], observed on `main` at `c186401` (15 Oct 2026). Re-verify before relying on them.

### 2.1 Language mix — important correction

- **Forge is predominantly Python, not Go.** `src/forge` + `modules/` contain ~399 `.py` files; `go/` contains ~31 `.go` files (`go/cmd/forgectl`, `go/cmd/forged`, `go/internal/{models,scaffold}`).
- This contradicts Roger's statement that Forge "is currently using Go." The language discussion in §1.2 was framed as Go vs Rust; **the real question for the core may be Python vs Rust**, with Go as a small CLI/daemon component. Roger has been told; his position on this is not recorded.
- `modules/Forge MES/frontend` is an existing **Next.js 14.2 / React 18** application. This is relevant to Roger's view that forge-mes is best served as a desktop GUI.

### 2.2 FxTS conventions FVTS follows

From `docs/FxTS/README.md` and existing frameworks:

- FxTS = "Forge x Test Specification": a **specification-first governance and instantiation framework**, adapted from MDEMG's UxTS. Not a testing layer.
- Four layers per framework: **Schema** (`{fw}.schema.json`), **Specs** (`*.{fw}.json`), **Runner** (`{fw}_runner.py`, subclass of `FxTSRunner` in `src/forge/governance/shared/runner.py`), **CI gate**.
- Directory layout `src/forge/governance/{fw}/{schema,specs,runners}/` with `__init__.py` files.
- Every spec carries an **FHTS integrity block** (`sha256-c14n-v1`, states `approved | modified | pending_review | reverted | unknown`, `change_history` max 3).
- `add_spec_hash()` in `shared/runner.py` stamps a **first** hash as `approved` automatically. For FVTS this was overridden to `pending_review` with `approved_by: null`, because the spec is agent-authored.
- Existing framework IDs: FATS, FACTS, FDTS (**Data**), FQTS, FLTS, FNTS, FSTS, FOTS, FPTS, FHTS, plus FTTS (Transport — has schema/runner/spec but **no** `docs/FxTS/FTTS.md` and no inventory row).
- FTTS's schema uses `additionalProperties: true` at top level; FVTS uses `false` (see D-2).

### 2.3 Existing models FVTS binds to

FVTS deliberately reuses these vocabularies instead of defining new ones:

| Model | Location | Values |
|-------|----------|--------|
| `QualityCode` | `src/forge/core/models/contextual_record.py` | GOOD, UNCERTAIN, BAD, NOT_AVAILABLE ("OPC UA-inspired") |
| `RecordTimestamp` | same | `source_time`, `server_time`, `ingestion_time` |
| `RecordContext` | same | site, area, equipment_id, batch_id, lot_id, recipe_id, operating_mode, shift, operator_id, extra |
| `AlarmState` | `src/forge/modules/ot/alarming/models.py` | NORMAL, ACTIVE_UNACK, ACTIVE_ACK, CLEAR_UNACK, SUPPRESSED, SHELVED, OUT_OF_SERVICE |
| `AlarmAction` | same | TRIGGER, CLEAR, ACKNOWLEDGE, SUPPRESS, UNSUPPRESS, SHELVE, UNSHELVE, DISABLE, ENABLE, RESET |
| `AlarmPriority` | same | CRITICAL, HIGH, MEDIUM, LOW, DIAGNOSTIC |
| `WriteRole` | `src/forge/modules/ot/control/models.py` | OPERATOR, ENGINEER, ADMIN (hierarchy ADMIN > ENGINEER > OPERATOR; "ADMIN can bypass interlocks (with reason)") |
| `WriteStatus` | same | CONFIRMED, UNCONFIRMED, REJECTED_VALIDATION, REJECTED_INTERLOCK, REJECTED_AUTH, FAILED_WRITE, FAILED_READBACK, PENDING |

Note: `WriteRole` lives in the **OT module**, not in core. There is no platform-wide role model that FVTS could bind to. [UNVERIFIED] whether another role model exists elsewhere (e.g. forge-mes uses Azure Entra roles in its frontend).

The OT module (`src/forge/modules/ot/`) already has an ISA-18.2 alarm state machine, a four-layer write engine with interlocks, authorization and audit (`control/{interlock,authorization,audit}.py`), and store-and-forward (`context/store_forward.py`). FVTS assumes these remain the enforcement points; FVTS only declares how they are presented and invoked.

### 2.4 Other repo observations

- `src/forge/governance/facts/specs/ot-module.facts.json` has `integrity.spec_hash: "pending-rehash-after-script-migration-additions"` and `hash_state: "draft"` — a pre-existing state not in the FHTS enum. Not touched by FVTS.
- `tests/governance` on `main`: 374 passed, 33 failed **with and without** the FVTS changes. [UNVERIFIED] cause; failures were in `tests/governance/ftts/` among others and may be missing optional dependencies (pytest was not even installed in the session sandbox).

### 2.5 Prior project context (from Roger's saved notes)

[USER] These earlier, confirmed decisions shape how FVTS should fit:

- MDEMG (Roger's Go-based memory/reasoning system) sits **alongside** `forge_core`, federated by entity reference.
- Normal Forge principle: **the hub owns all databases; modules never own DB connections** (MDEMG is a deliberate exception). → FVTS history queries go through forge-core, not module-owned stores.
- Transport between `forge_core` and MDEMG uses FxTS frameworks extended for bidirectional messaging.
- TimescaleDB CE is the dev-stage time-series DB; NextTrend's QuestDB consolidates into `forge_core`. → FVTS server-side decimation will run against forge-core's TSDB.
- **Temporal coherence is a hard requirement**: bitemporal stamping (valid vs transaction time) and as-of queries across the graph↔TSDB boundary. → FVTS includes `history.as_of_queries`.
- A prior naming collision ("adapter" meaning both LoRA adapter and Forge spoke adapter) taught that new FxTS suites need distinct names early. → FVTS name check (D-1).

---

## 3. The governing principle

**Modules describe, forge-display renders.** [PROPOSED, derived from USER's description of forge-display]

- A module never ships UI for its own data. It publishes one FVTS spec declaring what can be shown, what can be done, and on which surfaces and display types.
- Renderers (whatever framework) consume only what the spec declares.
- Safety behavior (role checks, confirmation, interlocks, audit) is **declared in the spec and enforced in forge-core**, so it is identical on every display type. A phone and an HMI must not differ in safety behavior.
- Rationale: UI frameworks will change over Forge's life (the Rust/Go research shows how fluid that landscape is); the contract between modules and display is the expensive thing to change later.

---

## 4. Decision log

Each entry: what the draft says, why, alternatives considered, and status.

### D-1 Framework name: FVTS ("View") [PROPOSED]

- **Why:** FDTS is taken by the Data Test Specification. "Display" therefore cannot use the D.
- **Alternatives:** FUTS (UI), FDSTS (breaks the 4-letter pattern), renaming nothing.
- **Status:** Open — Roger to confirm. Nothing references the ID yet.

### D-2 Strict schema: `additionalProperties: false` everywhere [PROPOSED]

- **Why:** The goal was to "lock this down." A display contract that tolerates undeclared fields lets renderers or modules quietly depend on things the contract doesn't govern.
- **Trade-off:** Diverges from FTTS (`true` at top level). Every future field requires a schema version bump.
- **Status:** Review.

### D-3 One FVTS spec per module [PROPOSED]

- **Why:** Mirrors FACTS (one spec per adapter); ownership is clear; `owner_module` links to the module's FACTS spec.
- **Alternative considered:** separate spec kinds for platform-wide render profiles. Rejected for v0.1.0 to keep one spec shape; profile baselines live normatively in `FVTS.md` instead (D-11).

### D-4 Data bindings: every displayed value is a declared point [PROPOSED]

- Renderers may bind only to points in `data_bindings.points`.
- Numeric points **require** engineering units and display precision; ENUM points require labels. Why: an operator value without units is ambiguous; this mirrors `RecordValue.engineering_units`.
- `range` is a **display/scale range, not an interlock** — interlocks stay in the OT module.
- `tag_path` supports `{placeholders}` resolved from scope context (e.g. `{area}/{equipment_id}/Temperature`) so one configured screen can serve many identical units. [PROPOSED] — resolution semantics are not yet specified.

### D-5 Quality and staleness are always visible [PROPOSED — strongly recommended]

- BAD and NOT_AVAILABLE are shown blank-with-marker or last-value-with-marker; **never as a plain value**. UNCERTAIN always carries a marker. Each point declares `stale_after_ms`.
- **Why:** On an operator HMI, a value that looks good but is stale or bad is a safety hazard — operators act on it. This is standard practice in HMI/SCADA systems and matches Forge's OPC-UA-inspired `QualityCode`.
- `timestamp_basis` per point chooses which of the three `RecordTimestamp` fields is displayed and used for staleness.

### D-6 Live updates [PROPOSED]

- `on_disconnect: mark_all_stale` (const). **Why:** a frozen screen that looks live is the worst failure mode for an HMI; the screen must keep displaying, visibly stale, through network loss.
- `coalescing: latest_wins` (const). **Why:** displays need the current value, not a queue; prevents backlog after reconnect.
- `heartbeat_ms` bounds idle subscriptions so a dead link is detected.
- `transport` enum `grpc_stream | websocket | sse`; `grpc_stream` rides the FTTS-governed gRPC transport. [PROPOSED] Browsers can't speak raw gRPC, so web renderers will likely need websocket/SSE or gRPC-Web — unresolved.
- `max_update_rate_hz` ceiling 20 Hz [PLACEHOLDER].

### D-7 History: server-side decimation only [PROPOSED — strongly recommended]

- `decimation.location: server` (const); default algorithm `min_max_per_bucket`; `max_points_per_series` cap.
- **Why server-side:** without it, mobile and browser trending can't work and desktop trending struggles across sites; it also centralizes the query against forge-core's TSDB (hub owns DBs).
- **Why min-max per bucket as default:** it preserves spikes and excursions, which matter in process trends; averaging hides them. LTTB (Largest-Triangle-Three-Buckets, a shape-preserving downsampling algorithm) and averaging are allowed alternatives.
- `as_of_queries` supports Roger's bitemporal requirement (§2.5).
- `max_points_per_series` 100–20,000 and the spec's 4,000 / 90 days are [PLACEHOLDER].

### D-8 Alarms: presentation only, logic stays in the module [PROPOSED]

- The spec must list **all 7** `AlarmState` values so no state is unrenderable.
- Only operator-initiated alarm operations are exposable as UI actions (ACKNOWLEDGE, SHELVE, UNSHELVE, DISABLE, ENABLE, RESET). System actions (TRIGGER, CLEAR, SUPPRESS, UNSUPPRESS) are never UI actions.
- SHELVE, DISABLE and RESET **require a reason code**. Why: these remove alarms from an operator's view; ISA-18.2 practice expects them to be justified and auditable.
- Priority colors must use tokens in a reserved `alarm.*` namespace. Why: ISA-101 high-performance HMI reserves color for abnormal conditions; reusing alarm colors for decoration desensitizes operators.

### D-9 Actions: safety declared once, enforced in core [PROPOSED — strongly recommended]

For `kind: tag_write` the schema requires:

- role ∈ {OPERATOR, ENGINEER, ADMIN} (not VIEWER);
- `confirmation` = `confirm` or `two_step_with_review` (never `none`);
- `interlock_feedback: true` — renderers must show interlock rejections with the blocking condition;
- `handled_statuses` = all 8 `WriteStatus` values — so an UNCONFIRMED read-back or FAILED_READBACK is never shown as success;
- `timeout_ms`.

All actions require `audit: true` (const). Why: every UI-initiated change must be traceable (who, what, old/new, reason, display type, site).

**Important:** the draft declares these rules; it does **not** yet guarantee forge-core enforces them independently of the UI. The OT write engine already does role/interlock/audit checks [REPO]; whether `two_step_with_review` and reason codes are enforced server-side is [UNVERIFIED] and likely needs work.

### D-10 VIEWER role [PROPOSED — open]

- FVTS adds `VIEWER` (read-only) to the role enum. `WriteRole` has no equivalent because it only governs writes.
- **Open:** add VIEWER to a core role model, or represent read-only access elsewhere. Also open: a platform-wide role model doesn't exist yet (WriteRole is OT-module-local).

### D-11 Render profiles and the normative baseline [PROPOSED — open values]

Four profiles: `desktop_hmi`, `desktop_app`, `web`, `mobile`. Specs may **tighten** the baseline in `FVTS.md`, never loosen it.

| Profile | Rate | Tag writes | Alarm ops |
|---------|------|-----------|-----------|
| desktop_hmi | 20 Hz | yes | all, per role |
| desktop_app | 10 Hz | **no (v0.1.0)** | ACKNOWLEDGE only |
| web | 4 Hz | no | ACKNOWLEDGE only |
| mobile | 1 Hz | no | ACKNOWLEDGE only |

- **Why writes only from desktop_hmi:** equipment writes should originate where an operator can see the process and its interlocks; this is the most conservative default.
- **Known tension:** forge-mes is expected to be a desktop GUI [USER] and MES often writes (recipes, setpoints, changeovers — the OT module has `mes_changeover.py` [REPO]). The `desktop_app` no-writes rule may be wrong for MES. **Open.**
- Rates are [PLACEHOLDER].
- Surfaces may list actions a profile forbids; renderers must **hide** (not disable) them.

### D-12 Surfaces: configured vs coded; HMI screens are configured [PROPOSED]

- `configured` = layout is versioned data authored per site; `coded` = application code driven by the contract.
- `hmi_screen` must be `configured`. Why: HMI screens are typically site-specific, change under management-of-change, and need versioning and audit like configuration rather than code releases.
- The **layout format** for configured surfaces is not defined in v0.1.0 (follow-on spec).

### D-13 Scope and multi-site [PROPOSED]

- `isa95_levels` and `required_context_fields` bind views to the ISA-95 hierarchy and `RecordContext`.
- `multi_site: true` views are read-only (runner check `fvts:cross-site-read-only`). Why: a cross-site dashboard should never be a path to write to a remote plant.

### D-14 Design system [PROPOSED]

- Contract references a token set (`tokens_ref`) and declares `isa101_high_performance`; required true when any surface is an `hmi_screen`.
- The token set itself does not exist yet; `forge://design/tokens/v1` is a [PLACEHOLDER] URI.

### D-15 Conformance via golden messages [PROPOSED]

- `conformance_tests.golden_messages_path`: a set of contract messages (subscription, history, alarm, action result) every renderer must render without error. Why: proves new renderers against the contract regardless of UI framework. Paths in the spec are [PLACEHOLDER]; the files don't exist.

---

## 5. The reference spec — what is real and what is invented

`ot-module.fvts.json` exists to exercise every schema section. **Most of its content is illustrative.**

| Element | Status |
|---------|--------|
| `owner_module: ot-module`, `facts_spec_ref` | [REPO] real |
| Enum values (states, priorities, roles, statuses) | [REPO] mirror real models |
| Point `ferm.temperature` path `{area}/{equipment_id}/Temperature`, units °F | Modeled on the `ContextualRecord` example (`Area1/Fermenter3/Temperature`, `FERM-003`) [REPO] — not a confirmed real tag |
| Points `TemperatureSP`, `Agitator/Running`, `Mode` and the mode labels Idle/Startup/Production/CIP | **Invented** [PLACEHOLDER] |
| Ranges 32–212 °F, stale 5,000 ms, 4 Hz, heartbeat 2,000 ms, 4,000 points, 90 days | [PLACEHOLDER] |
| Setpoint write: OPERATOR, two-step review, desktop_hmi only | [PROPOSED] |
| Shelve: ENGINEER, confirm, reason code, desktop_hmi only | [PROPOSED] |
| Settings: ENGINEER, staged_with_review, desktop_app | [PROPOSED] |
| `schema_ref`, `tokens_ref`, test paths | [PLACEHOLDER] URIs/paths that don't exist |

Before this spec is approved, replace invented points with real OT module tags and confirm roles against WHK operating practice.

---

## 6. What was verified

- Schema passes `jsonschema` Draft 2020-12 `check_schema`.
- Spec validates against the schema; all surface/action cross-references resolve.
- 14 deliberately unsafe spec variants were rejected (listed in the review doc).
- Spec integrity hash verified with the repo's `verify_spec_hash()`.
- No runner was written. None of the 12 planned runner checks (listed in `FVTS.md`) is implemented.

---

## 7. Open decisions — ask Roger, do not assume

1. **Framework ID** — FVTS, or another name (FDTS is taken).
2. **HMI role** — does Forge's HMI **replace** plant-floor SCADA displays, or sit **alongside** them (advisory/analytics)? This sets the reliability bar, renderer choice, and whether certified-grade determinism is required. **Highest-impact unanswered question.**
3. **Core language** — repo is mostly Python; is the decision Python vs Rust, Go vs Rust, or polyglot by protocol?
4. **VIEWER role** and a platform-wide role model.
5. **Write authority by display type** — especially whether forge-mes (desktop_app) may write.
6. **Mobile alarm acknowledgement** — allowed by the baseline; some sites require HMI-only acknowledgement.
7. **Rate ceilings** 20/10/4/1 Hz.
8. **Wire encoding** — proto messages for subscriptions, history and action results; browser transport (websocket/SSE/gRPC-Web).
9. **Configured-screen layout format** — follow-on spec.
10. **Server-side enforcement** of two-step review and reason codes in forge-core.
11. **Branch** for PRs — `reh3376/dev00` (saved rule) vs `reh3376_dev01` (currently active).
12. **Existing Next.js forge-mes frontend** — migrate, wrap, or keep.

---

## 8. Housekeeping state at end of session

- Claude pushed a branch `reh3376/fvts-display-contract` (commit `e29e6ab`) before Roger asked for no commits. Deletion from the session failed. **If it still exists, Roger intends to delete it** — do not build on it.
- The session's working copy was reset to `main` with no local changes.
- Deliverables given to Roger: `FVTS-v0.1.0-Review.md` (all file contents) and this document.

---

## 9. Glossary

- **FxTS** — Forge x Test Specification; Forge's spec-first governance framework family.
- **FVTS** — Forge View Test Specification (proposed); the module ↔ forge-display contract.
- **FACTS / FATS / FTTS / FHTS** — FxTS frameworks for adapters, APIs, transport, and hash integrity.
- **FHTS integrity block** — per-spec SHA-256 hash and approval state for AI-agent governance.
- **HMI** — Human-Machine Interface. **SCADA** — Supervisory Control and Data Acquisition. **MES** — Manufacturing Execution System. **PLC** — Programmable Logic Controller.
- **ISA-18.2** — standard for alarm management. **ISA-101** — standard for HMI design ("high-performance HMI": neutral base, color reserved for abnormal states). **ISA-95** — enterprise/control integration standard defining the enterprise → site → area → line → cell → equipment hierarchy.
- **OPC UA** — OPC Unified Architecture, an industrial communication standard; source of Forge's quality-code model.
- **Decimation** — reducing a time series to fewer points for display. **LTTB** — Largest-Triangle-Three-Buckets downsampling.
- **Bitemporal / as-of query** — tracking both when a fact was true and when it was recorded; querying "what was known at time T."
- **Render profile** — FVTS's per-display-type capability limits.
- **Surface** — an FVTS screen or view. **Configured** surface — layout stored as versioned data; **coded** surface — application code.
- **Golden messages** — fixed contract messages every renderer must accept, used as conformance tests.
- **TSDB** — Time-Series Database. **DB** — database. **ML** — Machine Learning. **GUI** — Graphical User Interface. **UI** — User Interface. **CI** — Continuous Integration. **PR** — Pull Request. **RPC** / **gRPC** — Remote Procedure Call / Google's RPC framework. **SSE** — Server-Sent Events. **LoRA** — Low-Rank Adaptation (fine-tuning adapter).
