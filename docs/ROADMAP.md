# Forge Roadmap

**Status date:** 2026-10-16 · **Owner:** reh3376 · **Companion:** [`BACKLOG.md`](../BACKLOG.md)

The backlog is the unit of work (one `FB-nnn` per problem, one PR per item). This document is the map above it: what the platform is becoming, which decisions are in force, how the open work groups into workstreams, the order to take it in, and the questions only the owner can answer. Update it whenever an item changes state, a decision is made, or a workstream is added.

**Status vocabulary:** `Not started` · `In progress` · `Done` · `Blocked (on X)` · `Decision needed`.

---

## 1. Decisions in force

| # | Decision | Date | Source |
|---|---|---|---|
| A-1 | **Hub and spoke.** forge-core is the hub; every system is a spoke speaking `forge.v1.AdapterService` over gRPC. The contract is FxTS-governed (FACTS per adapter, FTTS for transport). | 2026-10 | repo, `docs/FxTS` |
| A-2 | **Formal `forge-<management service>` modules share one language and structure: Go**, generated from the module SDK template (A-5). Speed and native gRPC. forge-mes, imported as NestJS + Next.js, is a bridge and will be rewritten (FB-076); forge-cmms, forge-whs and later modules start in Go. Open: whether the hub-hosted Python OT module and the Python ingestion adapters follow (D-7). The hub is Python today; a Rust core is parked (D-5). | 2026-10-16 | owner |
| A-3 | **All user interfaces come from forge-display.** Modules describe (FVTS spec); forge-display renders on desktop HMI, desktop app, web and mobile profiles. No module ships its own UI. | 2026-10-16 | owner, FVTS draft |
| A-4 | **HMI/SCADA is optional and pluggable.** Forge is a stand-alone enterprise management framework whose own management modules (forge-mes, forge-whs, forge-cmms, forge-hmi-scada, …) are not mandatory. A site keeps third-party software (e.g. Ignition) through an integration module (forge-ignition). forge-hmi-scada is activated per site. | 2026-10-16 | owner |
| A-5 | **A module SDK is required** so management and integration modules are built the same way (Go scaffold, manifest, FACTS spec, tests). | 2026-10-16 | owner |
| A-6 | **The hub owns the databases.** Modules do not own database connections (MDEMG is the one exception). MES data moves into the hub's `mod_mes` schema (FB-057). | earlier | owner notes |
| A-7 | **Safety stays in the core.** Role checks, interlocks, confirmation and audit for writes are enforced in forge-core/OT, never only in a UI. | 2026-10 | OT control design, FVTS D-9 |
| A-8 | **Workflow.** Develop on `reh3376_dev01`, one backlog item per PR, the auto-PR workflow opens the PR, the owner merges on green CI. Never push the next item onto a branch with an open PR. | 2026-10-16 | owner |
| A-9 | **Security posture.** Repository stays private until GitHub Support confirms garbage collection of the purged history (ticket #4862642); then re-enable secret scanning, push protection, CodeQL, private vulnerability reporting and fork-PR approval (FB-044). Nothing is imported without a gitleaks history scan. | 2026-10-15 | incident runbook |
| A-10 | **Local models only** for MDEMG/Jiminy tooling (llama-server `mdemg-llm-v1`); no OpenAI cloud models. | earlier | owner |

---

## 2. Where things stand

Delivered 2026-10-15/16 on the hub ↔ MES ↔ OT path (all merged):

| Capability | Items |
|---|---|
| Spoke push persisted by the hub, FACTS-checked | FB-053 |
| Hub → spoke write-back (gRPC callback, session-bound) | FB-054 |
| OT module drives the MES changeover sequence | FB-062, FB-065 (composition root, PLC CIP runner, REST) |
| Hosted OT module with PLC connections, supervision, liveness | FB-069, FB-070 |
| Control-write audit in the hub store; external MQTT publisher | FB-066, FB-067 |
| Durable adapter registry and ingest log | FB-060 (migration 007) |
| Pull RPCs on the spoke (Backfill, Subscribe, Unsubscribe) | FB-061 |
| Callback hardening: per-spoke token, TLS/mTLS to the spoke, scoped hub endpoints | FB-063 |
| FVTS v0.1.0 draft (schema + OT reference spec, `pending_review`) | PR 26 |
| FVTS runner (19 checks), render-profile baseline, reference renderer, golden set; CI gate on | FB-077 (PR 36) |
| Forge-issued module database credentials (`forge db access`) | FB-057 step 1 (PR 34) |
| OT FACTS spec hash verifiable again (`pending_review`, owner approval open) | FB-073 |

---

## 3. Workstreams

### WS-1 · Hub ↔ spoke contract and transport

Goal: one contract, both directions encrypted and authenticated, every RPC served.

| Item | Status | Notes |
|---|---|---|
| FB-072 hub gRPC server TLS (spoke → hub direction) | Done 2026-10-16 | `FORGE_GRPC_TLS_*`, `FORGE_GRPC_REQUIRE_TLS`; both gRPC directions can now be mTLS under one CA. |
| FB-071 `Collect` hand-over, FACTS entry for the audit-log replay, tag filter pushed into the query | Done 2026-10-16 | FACTS change approved by the owner in-session. |
| FB-055 cross-language contract test (real Python hub ↔ real NestJS/Go spoke in CI) | Not started | Becomes the acceptance test for the Go rewrite. |
| FB-056 dead-letter sink for exhausted ingest batches | Not started | FACTS names it; today it is a counter + log. |
| FB-002 servicer no-ops | Superseded by FB-053 (`HubIngestServicer`) | Close in the backlog. |

### WS-2 · Hub platform (wiring, auth, storage)

| Item | Status | Notes |
|---|---|---|
| FB-007 hub API auth on all routes, scope registry from manifests | Not started | FB-063 gated the write path only (`adapters:write`). |
| FB-075 scoped role model (platform-wide, site-scoped) | **In dialogue** (D-1) | Owner decided 2026-10-16: roles will be scoped; design worked through before code. |
| FB-001 mount Context Engine and Schema Registry apps | Not started | High. |
| FB-003 Postgres-backed `AccessController` | Not started | High; needed for module DB grants (A-6). |
| FB-004 schema naming (`mod_<x>` everywhere) · FB-005 migration for registry tables · FB-059 migration 004 table | Not started | Pair with FB-057. |
| FB-006 register RabbitMQ/MinIO health checks · FB-008 schema-registry id formats · FB-009 curation trigger | Not started | |
| Kubernetes production deployment (compose is dev-only) | Not started | Owner note; no backlog id yet. |

### WS-3 · Core data model (MES readiness)

FB-010 (`Lot.item_id`), FB-011 (step/phase execution, electronic batch record entities), FB-012 (typed ISA-88 hierarchy), FB-013 (`RecordContext` vs context field registry), FB-014 (naive `utcnow`), FB-015 (exports), FB-016 (Go models drop Python defaults). All `Not started`. The Go module rewrite (FB-076) depends on FB-010/011/012/016 being settled, because the Go models become the MES module's types.

### WS-4 · OT module (forge-ot)

Phases 1–4 of the P7 plan (OPC-UA client, tag engine, scripting/MQTT, alarms, control writes) exist in code; the changeover integration and the hosted runtime are done (section 2).

| Item | Status | Notes |
|---|---|---|
| FB-073 re-stamp the OT FACTS spec (placeholder hash, non-FHTS state) | Done 2026-10-16 (awaiting owner approval) | Hash verifies; `pending_review`. Approve after FB-079. |
| FB-079 OT FACTS spec vocabulary and identity (8 runner failures; three adapter identities) | Decision needed (D-8) | Extend the FACTS vocabulary for OT adapters or translate the spec; absorbs FB-018. |
| FB-074 server-side two-step review and reason codes for tag writes | Not started | After the FVTS decisions (D-2/D-4). |
| FB-018 OT manifest tier/output_format vs manifest builder · FB-020 remaining unwired OT ↔ MES hooks (`BatchContextResolver`) | Not started | FB-065 wired the recipe adapter; the batch resolver is still manual. |
| P7 Phases 5–7 (Ignition bridge, script migration, decommission) | Reframed by A-4 | Becomes: forge-ignition integration module + optional forge-hmi-scada module (WS-6/WS-7). |

### WS-5 · forge-mes: bridge now, Go module next

The NestJS backend and Next.js frontend stay as the bridge that keeps the hub ↔ MES ↔ OT path working. New feature work in them stops; only what the bridge needs is maintained.

| Item | Status | Notes |
|---|---|---|
| FB-076 rewrite forge-mes in Go; UI through forge-display | Not started — **Decision needed** (D-3) on the design | Suggested order: design doc → SDK scaffold under `go/` → hub link (Register/Configure/Ingest, write-back server, pull RPCs) against `go/gen/forge/v1` → changeover state machine + MQTT publishing → `mod_mes` (FB-057) → parity tests (FB-055) → cut-over → retire NestJS. |
| FB-057 `mod_mes` schema in the hub (data ownership per A-6) | Step 1 done 2026-10-16: Forge-issued credentials (`forge db access`, migration 008) | Steps 2–5 once, for the Go module (D-3). |
| Bridge debt that still matters while the bridge runs: FB-050 Dependabot alerts (High), FB-036 jest failures in CI, FB-052 CI exit hang, FB-031 inert nested workflows, FB-045 committed env vaults, FB-043 privacy hygiene | Not started | Triage against the bridge's remaining life; do not invest beyond safety. |
| Bridge debt that the rewrite retires: FB-028 frontend strict-mode errors, FB-030 stale admin-app refs, FB-032 cloud resource names, FB-033 submodule, FB-035 nested tooling configs, FB-064 eslint resolution | Not started | Close with FB-076 unless needed sooner. |

### WS-6 · forge-display and the FVTS contract

FVTS v0.1.0 is in `main`: schema, runner (19 checks, schema-runner parity), render-profile baseline, reference renderer, golden set and gate suite (FB-077, 2026-10-16). The OT reference spec still binds invented points and is `pending_review`; the gate allows only `fvts:hash-approved` to fail until FB-078.

| Step | Status | Notes |
|---|---|---|
| Resolve the FVTS open decisions (D-4) | Decision needed | Name, roles (FB-075), write authority per profile, mobile acknowledgement, rate ceilings, wire encoding/browser transport, configured-layout format, server-side enforcement (FB-074). |
| FB-077 `fvts_runner.py` with the 12 planned checks; golden-message conformance tests under `tests/governance/fvts` | **Done 2026-10-16** | 19 checks, parity asserted by test; gate on via `test_ot_module_views.py`. |
| FB-078 replace the invented fermenter points with real OT tags; owner approves the hash | Not started — **decided 2026-10-16** (OT stays the reference spec) | After FB-077 and FB-075. |
| Design-token set (`forge://design/tokens/v1`) with reserved `alarm.*` namespace (ISA-101) | Not started | |
| Renderer spike: one slice rendered in two renderers (candidates per the Rust research: Slint or egui for operator HMI, Dioxus for desktop apps) + Slint licence check | Not started | |
| forge-display module scaffold (Go-hosted contract services, renderer packaging) | Not started | After the spike. |
| forge-hmi-scada module decision (per-site activation, A-4) and forge-ignition integration module | Not started | |
| MES surfaces rendered by forge-display; retire the Next.js frontend | Blocked (on FB-076 and the scaffold) | |

### WS-7 · Module SDK

Needed before FB-076, forge-ignition and forge-hmi-scada can start the same way.

| Item | Status | Notes |
|---|---|---|
| Go module scaffold (`go/internal/scaffold` exists; `forge module init` is Python/adapter-only — FB-017) | Not started | Template must produce backend (hub link) + FVTS spec stub, not a UI. |
| FB-019 duplicate SDK copies and template modules drift | Not started | |
| FB-021 FACTS approval CLI | Not started | Also serves FVTS/FHTS approvals. |

### WS-8 · Governance (FxTS)

FTTS has a schema, runner and spec but no `docs/FxTS/FTTS.md` and no inventory row. FB-080 (the FACTS runner has no schema-valid check; 7 of 9 specs fail schema validation). FB-022 ruff debt (1,148 findings; CI advisory) and FB-048 (advisory gates) — tighten gate by gate as debt is paid. FB-014 (DTZ rule).

### WS-9 · Security and repository operations

| Item | Status | Notes |
|---|---|---|
| Public flip after GC confirmation; re-enable protections | Blocked (on GitHub Support #4862642) | Runbook §6; re-probe the purged SHAs first; collaborator must re-clone. |
| FB-044 protections reset while private · FB-049 branch protection · FB-047 auto-PR identity token | Not started | |
| FB-029 rotated credentials (done) and FB-046 purge consequences | Done / monitor | Keep the gitleaks scan rule (A-9). |
| FB-043 privacy hygiene · FB-045 env vaults · FB-050 Dependabot | Not started | FB-050 also in WS-5. |

### WS-10 · MDEMG tooling

FB-038, FB-039, FB-040, FB-041, FB-042 — local tooling; details in `docs/MDEMG-INIT-BUGS.md`. Not on the product path.

### WS-11 · Documentation

FB-024 README counts and placeholder row, FB-025 phase numbering, FB-027 stale report. `docs/personal/*` (FVTS context, FVTS review package, Rust frontend research) need a refresh once D-1/D-3 are answered: committed status (PR 26), branch name (`reh3376_dev01`), governance suite (407 passed), the gateway role model, modules-in-Go, Next.js frontend retired. `modules/Forge MES/CLAUDE.md` claims Next 15 / React 19; the code is Next 14.2 / React 18.

---

## 4. Proposed sequence

1. ~~Merge the backlog PR; land **FB-072**~~ — done 2026-10-16; both gRPC directions can be mTLS.
2. Decision session (section 5): role model, FVTS questions, forge-mes Go design, module SDK shape.
3. **FB-076 design doc** (scope, data ownership, hub link, what the bridge keeps doing meanwhile); owner sign-off.
4. **Module SDK Go scaffold** (WS-7) — the first consumer is the Go forge-mes.
5. **FB-076 phase 1:** Go forge-mes speaks to the hub (Register/Configure/Ingest, write-back, pull RPCs) with FB-055 as the acceptance test.
6. **FVTS runner + golden tests** (WS-6) in parallel with 5; approve the OT reference spec.
7. **FB-057 `mod_mes`** with FB-004/005/059, for the Go module.
8. **FB-076 phases 2–3:** changeover + MQTT, parity, cut-over; retire the NestJS backend.
9. **forge-display scaffold** and the renderer spike; MES surfaces first; retire the Next.js frontend.
10. Hub platform items (FB-001/003/007) as the Go module and forge-display start needing them.

Security/ops items (WS-9) run alongside and are gated by GitHub Support, not by this sequence.

---

## 5. Decision queue (owner input needed)

**D-1 · Platform role model (FB-075).** *2026-10-16: the owner decided roles will be scoped; the model is being designed in dialogue before any code (see `docs/decisions/roles.md` once drafted).* Two role enums exist today and neither covers the other:

| Model | Values | Used by |
|---|---|---|
| `forge.gateway.models.Role` | `admin`, `operator`, `viewer` | Hub REST auth: API keys and JWTs carry a role, roles expand to scopes such as `adapters:write` (enforced on write/backfill/subscription endpoints since FB-063). |
| `forge.modules.ot.control.models.WriteRole` | `OPERATOR`, `ENGINEER`, `ADMIN` | PLC writes: permissions per area/tag pattern, interlock bypass (`ADMIN`), recipe downloads (`ENGINEER`). |

FVTS binds UI actions to the union (`VIEWER`, `OPERATOR`, `ENGINEER`, `ADMIN`). The question is whether Forge has one security role model for people (hub API, UI actions, PLC writes) with `ENGINEER` added to the gateway and `WriteRole` mapped onto it, or keeps the OT write roles separate from platform access roles. Recommendation: one model (`viewer < operator < engineer < admin`), scopes derived from it, OT keeps its per-tag permissions but reads the role from the platform identity.

**D-2 · FVTS runner and golden tests (not forge-mes).** *Decided 2026-10-16: yes to both — FB-077 (done, PR 36), FB-078 (open).* This concerns the FVTS governance framework itself: `src/forge/governance/fvts/` has a schema and a reference spec for the **OT module** (`ot-module.fvts.json`, with invented fermenter tags), but no `fvts_runner.py` and no conformance tests, so nothing enforces the contract and the spec's hash cannot be approved. The questions: should the OT module stay the reference spec (replace the invented points with real OT tags), and is the runner wanted before forge-display work starts? Recommendation: yes to both; the runner is small and the golden messages become forge-display's first test fixtures.

**D-3 · forge-mes Go rewrite design (FB-076).** What the Go module must carry on day one (hub link, changeover state machine, MQTT publishing, recipe/production-order queries), what stays in the NestJS bridge until cut-over, how Prisma data moves into `mod_mes`, and whether GraphQL survives or the hub API replaces it. Needs a short design doc for sign-off.

**D-4 · FVTS open items.** Framework name (FVTS vs other), write authority per render profile (desktop_app writes), mobile alarm acknowledgement, rate ceilings (20/10/4/1 Hz), wire encoding and browser transport (gRPC-Web/WebSocket/SSE), configured-layout format, server-side enforcement (FB-074). A-3 and A-4 answer the HMI role question; the rest remain open.

**D-5 · Core language (Python vs Rust) for the hub.** Parked; not required by anything in section 4.

**D-6 · Public flip timing.** When GitHub Support confirms GC.

**D-8 · FACTS vocabulary for OT adapters (FB-079).** The FACTS v0.1.0 schema speaks the IT integration vocabulary of the first spokes (GraphQL, REST, RabbitMQ, MQTT, WebSocket, file, database; `REGISTERED…STOPPED` lifecycle; `none/basic/certificate…` auth). The OT module's spec uses OPC-UA terms (`opcua_read/subscribe/write/history/browse`, `on_demand`, `DISCONNECTED/CONNECTED/RECONNECTING`, `anonymous/username_password`, `enum`/`object` params, `tag_value`) and fails 8 runner checks, so its hash can be verified (FB-073) but should not be approved as-is. Options: (a) extend the schema with an OT vocabulary and keep the spec's meaning; (b) translate the spec into the existing vocabulary and lose the OPC-UA specifics; (c) a FACTS v0.2.0 with a per-tier vocabulary. Recommendation: (a) — the gRPC spokes (bosc-ims, scanner-gateway) already stretch the enum the same way (FB-080), so the schema is the thing to grow. The same item reconciles the adapter's three identities (`forge-ot-module` in code, `ot-module` in manifest.json and the spec) to one.

**D-7 · Scope of the Go standard.** A-2 covers the formal management-service modules. Still to decide: whether the hub-hosted Python OT module (`src/forge/modules/ot`) and the Python ingestion adapters (`src/forge/adapters/*`) move to Go over time or stay Python inside the hub, and whether integration modules (forge-ignition) follow the Go template.

---

## 6. Open backlog by workstream

| Workstream | High | Med | Low | Items |
|---|---|---|---|---|
| WS-1 transport | — | FB-072 | FB-055, FB-056, FB-071 | FB-002 to close as superseded |
| WS-2 hub platform | FB-001, FB-003 | FB-004, FB-005, FB-006, FB-007, FB-059, FB-075 | FB-008, FB-009 | |
| WS-3 data model | FB-010, FB-011 | FB-012, FB-013, FB-016 | FB-014, FB-015 | |
| WS-4 OT module | — | FB-020, FB-079 | FB-018, FB-074 | FB-073 done (awaiting approval) |
| WS-5 forge-mes | FB-028, FB-050, FB-076 | FB-030, FB-031, FB-032, FB-033, FB-036, FB-052, FB-057 | FB-035, FB-045, FB-064 | FB-034 done (bridge link) |
| WS-6 forge-display | — | — | — | No backlog ids yet; tracked here until the design lands |
| WS-7 module SDK | — | FB-017 | FB-019, FB-021 | |
| WS-8 governance | — | FB-022, FB-048, FB-080 | FB-014 | FTTS doc has no id yet |
| WS-9 security/ops | FB-029, FB-044, FB-046 | FB-043, FB-047 | FB-049 | public flip blocked on Support |
| WS-10 MDEMG | — | FB-038, FB-042 | FB-039, FB-040, FB-041 | |
| WS-11 docs | — | FB-025 | FB-024, FB-027 | personal docs refresh |
