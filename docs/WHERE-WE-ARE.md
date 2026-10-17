# Where we are

**Status date:** 2026-10-17 · **Branch:** `reh3376_dev01` (last merged PR: 37) · **Owner:** reh3376
**Companions:** [What Forge will be](VISION.md) · [Where we are going](WHERE-WE-ARE-GOING.md) · [Roadmap](ROADMAP.md) · [Backlog](../BACKLOG.md)

This page is the honest snapshot: what exists in the repository today, what is wired end to end, what is governed, and what is missing against [`VISION.md`](VISION.md). It is updated before every push that changes the state it describes (rule of 2026-10-16: documentation is current before every push). Numbers are from the tracked tree at the status date; "exists" means code is present, "wired" means it runs in the deployed hub, "governed" means a spec and a gate cover it.

---

## 1. In five lines

1. The **hub ↔ spoke contract works end to end**: a spoke registers, is checked against its FACTS spec, pushes records that are persisted, is pulled (Collect/Backfill/Subscribe) and receives write-backs, over TLS/mTLS both ways with per-spoke tokens.
2. The **OT module runs inside the hub** with OPC-UA connections, a tag engine, ISA-18.2 alarms, the full control-write defense chain, and drives the MES changeover sequence including the PLC CIP runner.
3. **forge-mes is a bridge**: the imported NestJS backend and Next.js frontend speak the spoke contract; the Go rewrite is decided but not designed.
4. **Governance is real for four frameworks** (FATS, FACTS, FTTS, FVTS) plus FHTS hashing; the other seven are stubs or planned. forge-display does not exist yet; its contract (FVTS) does, with a runner and golden messages.
5. **Not yet**: scoped roles in the gateway, the Context Engine and Schema Registry mounted, `mod_mes` in the hub, the Go module SDK, the hub-of-hubs federation, Kubernetes, and any management module in Go.

---

## 2. Numbers

| Measure | Value |
|---|---|
| Python hub (`src/forge`) | 346 files, ~65,000 lines |
| Python tests | 247 files, ~51,000 lines, 3,951 test functions; full suite green on 2026-10-17 |
| Go (`go/`) | 31 files, ~8,300 lines (1,534 models, 112 scaffold, generated bindings, 58 lines of daemon/CLI stubs) |
| forge-mes bridge (`modules/Forge MES`) | ~248,000 lines of TypeScript (backend + frontend) |
| `AdapterService` RPCs | 12 (Register, Configure, Start, Stop, Health, Ingest, Collect, Subscribe, Unsubscribe, Write, Backfill, Discover) |
| Hub REST routes | 20 on the hub app, plus OT i3X (8) and OT control (11), plus the curation app mounted at `/curation` |
| Storage migrations | 8 (core schema, spoke schemas, canonical, TimescaleDB, lineage, contextual records, adapter registry, module permissions) |
| FACTS specs | 9 (8 validate against the schema and pass the runner; ot-module fails `facts:schema-valid` + 8 vocabulary checks, FB-079); 5 await owner approval after the FB-080 re-stamp |
| FATS specs | 21 |
| FVTS specs | 1 (ot-module reference, `pending_review`) |
| CI jobs | hub-python, hub-go, mes-module, secrets-scan; auto-PR workflow |
| Commits | 1,588 (includes the imported MES history) |

---

## 3. Component by component

Legend: ✅ exists and wired · 🟡 exists, partly wired or partly governed · ⬜ not started. Gaps name the backlog item.

### 3.1 Transport and ingest

| Capability | State | Notes |
|---|---|---|
| gRPC `AdapterService`, Python and Go bindings | ✅ | `src/forge/proto`, `src/forge/transport`, `go/gen/forge` |
| TLS / mTLS hub → spoke and spoke → hub | ✅ | FB-063, FB-072 |
| Per-spoke callback token, scoped hub endpoints | ✅ | FB-063 |
| Push persisted and FACTS-checked at Register | ✅ | FB-053; `forge.ingest`, `forge.ingest.facts_check` |
| Pull: Collect, Backfill, Subscribe/Unsubscribe on the spoke | ✅ | FB-061, FB-071 |
| Hub → spoke write-back (session-bound callback) | ✅ | FB-054 |
| Durable adapter registry and ingest log | ✅ | FB-060, migration 007 |
| FTTS transport spec and runner | 🟡 | Schema + runner exist; spec at `specs/grpc-hardened-transport.ftts.json`; no `docs/FxTS/FTTS.md` |
| Transport parity tests for the Go module | ⬜ | FB-055 |

### 3.2 Hub platform

| Capability | State | Notes |
|---|---|---|
| Hub REST API (adapters, records, writes, subscriptions, backfill, collect, ingest log, info/health) | ✅ | `src/forge/api/main.py` |
| Curation service mounted | ✅ | `/curation` |
| Context Engine (F21) and Schema Registry (F20) | 🟡 | Code exists (`forge.context`, `forge.registry`); **not mounted** in the deployed app (FB-001) |
| Gateway: auth, RBAC, rate limiting | 🟡 | Middleware exists; auth off by default, no route uses `require_scope`/`require_role` (FB-007) |
| Access controller persistence | 🟡 | In-memory only; Postgres controller unimplemented (FB-003) |
| Registry/equipment tables in Postgres | 🟡 | FB-005 |
| Observer | 🟡 | Package exists; no SLO/FOTS wiring |
| CLI `forge` | ✅ | adapter list/status, governance run/validate-spec, migrate up/status/down, db access grant/revoke/list/issue |

### 3.3 Storage

| Capability | State | Notes |
|---|---|---|
| Engines: PostgreSQL, TimescaleDB, Neo4j, Redis | ✅ | `forge.storage.engines` |
| Storage router and factory | ✅ | |
| Versioned migrations (8) | ✅ | |
| Forge-issued module database credentials (`forge db access`) | ✅ | FB-057 step 1, migration 008; password printed once, never stored |
| `mod_mes` schema in the hub (MES data moves in) | ⬜ | FB-057 steps 2–5, after the FB-076 design |
| Backups, restore procedure | ⬜ | No backlog id yet |

### 3.4 Spokes (adapters)

| Spoke | Code | FACTS spec | Notes |
|---|---|---|---|
| whk-wms | ✅ 772 lines | approved (reh3376) | reference spec |
| forge-mes | ✅ 1,078 lines + the NestJS spoke | approved (reh3376) | 18 data sources incl. AuditLog backfill (FB-071) |
| whk-cmms | ✅ 810 | `pending_review` (FB-080 re-stamp; previous hash approved by reh3376) | cross-module flows and pre-FHTS history moved to `metadata` |
| whk-erpi | ✅ 769 | `pending_review` (FB-080 re-stamp; previous hash approved by audit) | same |
| whk-nms | ✅ 853 | `pending_review` (FB-080 re-stamp; previous hash approved by reh3376) | pre-FHTS history moved to `metadata` |
| bosc-ims | ✅ 1,909 | approved (no approver recorded) | gRPC source types now in the schema |
| next-trend (historian) | ✅ 801 | `pending_review` (FB-080 re-stamp; was auto-approved) | dead-letter keys renamed to the schema's |
| scanner-gateway | ✅ 1,403 | `pending_review` (FB-080 re-stamp; was auto-approved) | own proto under `proto/scanner`; routing rules and scan rejection moved to `metadata` |
| ot-module | ✅ (the OT module itself) | `pending_review` (FB-073) | `facts:schema-valid` (66 violations) + 8 vocabulary failures; three disagreeing identities (FB-079) |
| csv_file, mqtt_sparkplug, opcua, rest_generic | ⬜ | — | package stubs only (one-line `__init__`) |

The FACTS runner validates every spec against the JSON schema first (`facts:schema-valid`, FB-080) and reads its enums from the schema; 8 of 9 specs validate, the OT spec waits on D-8.

### 3.5 OT module (forge-ot)

| Capability | State | Notes |
|---|---|---|
| OPC-UA client (asyncua), tag engine, context resolvers | ✅ | `forge.modules.ot.opcua_client`, `tag_engine`, `context` |
| ISA-18.2 alarming (state machine, detector, engine, integrations, API) | ✅ | `forge.modules.ot.alarming` |
| Control writes: validation → interlocks → authorization → write with read-back → audit | ✅ | `forge.modules.ot.control`; audit in the hub store and an external MQTT publisher (FB-066, FB-067) |
| MES changeover: orchestrator, PLC CIP runner, recipe integration, REST | ✅ | FB-062, FB-065 |
| Hosted in the hub with PLC connections, supervision, liveness | ✅ | FB-069, FB-070; `forge.modules.ot.host` |
| i3X REST shape, MQTT ingress, Ignition bridge (read-only parallel run) | ✅ | `i3x`, `mqtt`, `bridge` |
| Scripting SDK replacing `system.*` | ✅ | `forge.sdk.scripting` |
| Server-side two-step review and reason codes for writes | ⬜ | FB-074 |
| Batch context resolver wired to MES | ⬜ | FB-020 |
| One adapter identity (code says `forge-ot-module`, manifest and spec say `ot-module`) | ⬜ | FB-079 (includes FB-018) |

### 3.6 forge-mes

| Capability | State | Notes |
|---|---|---|
| NestJS backend + Next.js frontend imported as the bridge | ✅ | `modules/Forge MES`; spoke speaks the contract (push, pull, Collect, token, TLS) |
| Go rewrite from the module SDK | ⬜ | FB-076; decided (A-2), design doc not written (D-3) |
| Prisma data into the hub's `mod_mes` | ⬜ | FB-057 steps 2–5 |
| Frontend retired in favour of forge-display | ⬜ | after forge-display exists |

### 3.7 Module SDK and Go

| Capability | State | Notes |
|---|---|---|
| Python module builder (manifest builder, scaffolder, generators, `forge module init`) | 🟡 | Adapter-style, backend-only templates (FB-017); duplicate SDK copies drift (FB-019) |
| Go models mirroring the core models | ✅ | `go/internal/models` (1,534 lines); drop Python defaults (FB-016) |
| Go scaffold | 🟡 | `go/internal/scaffold` (112 lines); not a module template yet |
| `forged` daemon, `forgectl` | ⬜ | 22- and 36-line placeholders |
| Template module copies (`modules/Forge CMMS`, `Forge ERPI`, `Forge DB Orchestration`) | 🟡 | adapter templates, not Go modules |

### 3.8 forge-display and FVTS

| Capability | State | Notes |
|---|---|---|
| FVTS v0.1.0 schema, 19-check runner, render-profile baseline, reference renderer, golden messages, CI gate | ✅ | FB-077 (PR 36); `src/forge/governance/fvts`, `tests/governance/fvts` |
| OT reference FVTS spec with real tags, owner-approved | ⬜ | FB-078 (invented fermenter points today; `pending_review`) |
| forge-display runtime (any profile) | ⬜ | no code; no backlog id until the design lands |
| FVTS open decisions (name, write authority per profile, mobile acknowledge, transport, layout format) | ⬜ | D-4 |

### 3.9 Governance (FxTS)

| Framework | State |
|---|---|
| FATS | schema + runner + 21 specs |
| FACTS | schema + runner (`facts:schema-valid` + 35 rule checks, enums read from the schema) + 9 specs; 8 validate (OT spec: FB-079); 5 re-stamped specs await owner approval |
| FHTS | hashing, verification, approval, revert, registry; owner-only approval in practice |
| FTTS | schema + runner + 1 spec; no doc page |
| FVTS | schema + runner + reference renderer + 1 spec |
| FQTS, FSTS | stubs |
| FDTS, FLTS, FNTS, FOTS, FPTS | planned (doc pages only) |
| FACTS approval CLI | ⬜ FB-021 |

### 3.10 Security, identity, topology

| Capability | State | Notes |
|---|---|---|
| Role model designed in dialogue (R-1 … R-17) | 🟡 | `docs/decisions/roles.md`; Q21 (site-hub derived copy of assignments) and Q22 (ladder preset) open |
| Scoped roles enforced in the gateway | ⬜ | FB-075 (two role enums today: gateway `Role`, OT `WriteRole`) |
| Identity methods (OIDC, local, service; then LDAP/AD; then SAML) | ⬜ | R-10 |
| Hub of hubs (site / enterprise / area), upward audit, on-demand data | ⬜ | R-9, R-13, R-14, R-16, R-17; no code |
| Offline token verification, one-hour default lifetime | ⬜ | R-8, R-15 |
| Repository hardening | 🟡 | public again since 2026-10-17 (owner's call, ahead of Support's GC); secret scanning, push protection, CodeQL default setup, Dependabot, private vulnerability reporting and fork-PR approval on; gitleaks in CI; the 4 open secret-scanning alerts are the rotated whk-mes values still reachable through `refs/pull/4..8` until Support GCs (ticket #4862642); non-provider patterns and validity checks are owner toggles the API refuses (FB-044) |

### 3.11 Deployment and operations

| Capability | State | Notes |
|---|---|---|
| Docker Compose (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, minio, forge-init, forge-hub) | ✅ dev only | `deploy/docker` |
| Hub container image | ✅ | `deploy/docker/Dockerfile.forge` |
| Kubernetes production deployment | ⬜ | owner note; no backlog id |
| Backups, SLOs, performance baselines | ⬜ | FOTS/FPTS planned |

### 3.12 Engineering platform

| Practice | State |
|---|---|
| One backlog item per PR, auto-PR, owner merges on green | ✅ (A-8) |
| Every finding fixed or recorded in `BACKLOG.md` | ✅ (80 items recorded to date) |
| Documentation current before every push | ✅ rule since 2026-10-16 |
| Owner-only spec approval | ✅ in practice; CLI support pending (FB-021) |
| MDEMG/Jiminy governed memory, local models only | ✅ instance per project (A-10) |
| Lint debt | 🟡 ruff advisory gates (FB-022, FB-048) |

---

## 4. Open decisions (owner)

| # | Decision | Blocks |
|---|---|---|
| D-1 | Platform role model (one scoped model vs separate OT write roles) — design in `docs/decisions/roles.md`, Q21/Q22 open | FB-075, FB-078, FB-074 |
| D-3 | forge-mes Go design document | FB-076, FB-057 steps 2–5, the Go SDK scaffold |
| D-4 | FVTS open items (name, write authority per profile, mobile acknowledge, transport, layout format, server-side enforcement) | forge-display design |
| D-5 | Hub core language (Python vs Rust) — parked | nothing in the current sequence |
| D-7 | Scope of the Go standard (OT module and Python adapters) | long-term shape of `src/forge/modules` and `src/forge/adapters` |
| D-8 | FACTS vocabulary for OT adapters (extend the schema vs translate the spec) | FB-079, approval of the OT FACTS spec |

---

## 5. Largest gaps against the vision

1. **No forge-display** (vision §P-8): the contract and runner exist; the renderer does not.
2. **No management module in Go** (vision §3.3): forge-mes is the TypeScript bridge; the SDK template does not exist yet.
3. **No scoped roles in force** (vision §P-11): the gateway's auth is off by default and the role model is still being designed.
4. **No federation** (vision §P-10): a single hub only; no hub-of-hubs code.
5. **Hub services unmounted** (FB-001): Context Engine and Schema Registry exist but are not served.
6. **Seven governance frameworks are stubs or planned**; FACTS now validates against its own schema, but six of its nine specs await the owner's hash approval.
7. **No production deployment** (vision §P-12).

---

## 6. How to update this page

Before a push that changes any row above: change the row, the numbers in §2 if they moved, and the status date. If a decision in §4 is taken, move it to `ROADMAP.md` §1 and remove it here. New gaps get a backlog id first, then a row.
