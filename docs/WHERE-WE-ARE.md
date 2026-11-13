# Where we are

**Status date:** 2026-11-13 · **Branch:** `reh3376_dev01` (last merged PR: 88) · **Owner:** reh3376
**Companions:** [What Forge will be](VISION.md) · [Where we are going](WHERE-WE-ARE-GOING.md) · [Roadmap](ROADMAP.md) · [Backlog](../BACKLOG.md)

**Pick-up point (2026-11-13):** PR 88 is merged and `reh3376_dev01` is level with `main`. FB-094 step 2 (clock readers) is in the next PR: every OPC-UA response now measures the server's clock (a tap on asyncua's `_send_request` reads `ResponseHeader.Timestamp`, T1/T3/T4 NTP style), the `CurrentTime` probe runs on a per-connection cadence the operator changes at runtime (`POST /control/connections/{name}/clock-probe-interval`, 1 s minimum, value and setter on the status), `ClockOffsetTracker` keys each series by the clock measured (`server:WHK01`, `device:WHK01`; `clocks()`, the `forge.clock.id` metric attribute), `PlcConnectionSpec` declares `source_timestamp_origin` and names the probe cadence `clock_probe_interval_seconds`, and a probe answered without a clock value is counted on the status (`clock_unreadable`) ahead of FB-093's refusal; Logix, S7 and Modbus readers implement the shared `ClockReader` surface when their drivers land, and Sparkplug's one-way publish stamp follows its ingest adapter. Next: FB-094 step 3 (the four remaining P-3 fields and the correction on entry), then step 6 (the per-tag sampling bound), FB-090, FB-093, FB-092, FB-091. PR 88 (FB-088, the first one-clock step): no record builder invents a source time any more (the OPC-UA converter and tag registry, the nine adapters, the BOSC collectors, the Ignition bridge, the REST path and the interim MES bridge); a value without a source stamp is refused unless its connection declares `source_timestamp_origin: forge`, and then Forge's own read time stands in with `source_clock=forge` and the poll bound as `source_uncertainty_seconds` (the first two of the record's six time-quality fields, proto 6 and 8, on the Python, Go and bridge models); a refusal is never silent (the adapter goes DEGRADED, `AdapterHealth.refusals`/`last_refusal`/`error_message`, the `forge.ingest.refused` metric, `forge adapter status`, the REST response and ingest log). Two findings were recorded on the way (FB-108: the hypertable persists only `source_time`; FB-109: a remote spoke's own health never reaches the hub) and one fixed (`forge.clock.offset` is a gauge: the histogram dropped negative offsets). After the one-clock steps come FB-097's eight steps, then FB-017 and the forge-mes steps. On 2026-11-03 the owner answered every open design question one at a time (34 answers: D-3 Q-1 to Q-10, D-9 Q-1 to Q-6, D-10 Q-1 to Q-8, D-1 Q21 and Q22, D-8, the seven FVTS items of D-4) and declared the answers the signature of the four records: `docs/decisions/forge-mes-go.md`, `one-clock-ot-source-time.md`, `one-schema-registry.md` and `roles.md` now read `approved by reh3376 on 2026-11-03`, each with the answers and a debt check per answer in its last section. Two standing rules came with the answers: **no silent failure** (a refusal or fail-closed state raises an alarm at once and is visible on status, health, API, CLI and forge-display) and **no decision that pins the platform in**. Two backlog items were recorded from the answers (FB-106 GraphQL gateway hub module, FB-107 local-model formula assistant). Implementation starts next, one PR each, in the recommended order: the one-clock steps (FB-088 first, then FB-094's clock readers and fields, FB-090, FB-093, FB-092, FB-091), then FB-097's eight steps, then the forge-mes Go steps beginning with the Go SDK scaffold (FB-017), with FB-075 and FB-079 alongside; forge-display design (M4) is unblocked. FB-104 and FB-105 (the vendored tutorial framework's heading-pin and sidebar-label defects, and its vulnerable lockfile that failed the Dependabot security updates on `main` six times per push) were done on 2026-11-03 upstream in mdemg as tutorial-forge 1.1.0 and re-vendored here unchanged: a pin attaches by position to the first heading after it (29 of 34 pins on the mdemg site had been dead), heading text is normalised once for slugs and sidebar labels, reveal-md is gone, puppeteer 25 and mermaid 12 need Node 22 (the Deploy Tutorial workflow moves to it and runs the framework's nine tests), and `npm audit` reports 0 findings. FB-068 (the embedded broker's RETAIN semantics for local subscribers: a live message arrives with RETAIN=0, a new subscription gets the retained store replayed with RETAIN=1) was done on 2026-10-29. No other decision-free backlog item is left: FB-100 waits on FB-057 step 2; FB-097 on D-10 (`decisions/one-schema-registry.md`, Q-1 to Q-8); FB-088 and FB-090 to FB-094 on the owner's signature of the one-clock record (D-9); the rest on D-1, D-3, D-4 and D-8 (§4). FB-103, the Forge tutorial package built with `scripts/tutorial-forge` (two tracks from a landing fork, contributor onboarding and end-user overview; deck `docs/tutorial.md`, config `tutorial.config.json`, output `build/tutorial-static/`), modelled on the MDEMG tutorial at https://reh3376.github.io/mdemg/, was delivered on 2026-10-27 (PR 78) and is live at https://reh3376.github.io/forge/ since 2026-10-28, when the owner enabled GitHub Pages and the Deploy Tutorial workflow published `main`.

This page is the honest snapshot: what exists in the repository today, what is wired end to end, what is governed, and what is missing against [`VISION.md`](VISION.md). It is updated before every push that changes the state it describes (rule of 2026-10-16: documentation is current before every push). Numbers are from the tracked tree at the status date; "exists" means code is present, "wired" means it runs in the deployed hub, "governed" means a spec and a gate cover it.

---

## 1. In five lines

1. The **hub ↔ spoke contract works end to end**: a spoke registers, is checked against its FACTS spec, pushes records that are persisted, is pulled (Collect/Backfill/Subscribe) and receives write-backs, over TLS/mTLS both ways with per-spoke tokens.
2. The **OT module runs inside the hub** with OPC-UA connections, a tag engine, ISA-18.2 alarms, the full control-write defense chain, and drives the MES changeover sequence including the PLC CIP runner.
3. **forge-mes is Go and not yet built**: the imported NestJS backend and Next.js frontend stand in as the interim bridge and speak the spoke contract; the Go rewrite (FB-076) is decided and designed (`docs/decisions/forge-mes-go.md`, signed 2026-11-03); the Go SDK scaffold is its first step.
4. **Governance is real for four frameworks** (FATS, FACTS, FTTS, FVTS) plus FHTS hashing; the other seven are stubs or planned. forge-display does not exist yet; its contract (FVTS) does, with a runner and golden messages.
5. **Not yet**: scoped roles in the gateway, `mod_mes` in the hub, the Go module SDK, the hub-of-hubs federation, Kubernetes, and any management module in Go.

---

## 2. Numbers

| Measure | Value |
|---|---|
| Python hub (`src/forge`) | 354 files, ~68,500 lines |
| Python tests | 259 files, ~56,000 lines, 4,187 test functions (4,454 collected); full suite green on 2026-11-03 on the PR 82 dependency set (pydantic 2.14.2, grpcio 1.85.0, pytest 9.2.0, ruff 0.17.3) |
| Go (`go/`) | 32 files, ~9,500 lines (1,800 of models and 1,488 of their tests, 112 scaffold, generated bindings, 58 lines of daemon/CLI stubs); `gofmt`, `go vet` and `go test` gate CI |
| Interim MES bridge (`modules/Forge MES`; NestJS + Next.js until the Go forge-mes lands, FB-076) | ~248,000 lines of TypeScript (backend + frontend) |
| `AdapterService` RPCs | 12 (Register, Configure, Start, Stop, Health, Ingest, Collect, Subscribe, Unsubscribe, Write, Backfill, Discover) |
| Hub REST routes | 41 on the hub app (20 platform, 12 Context Engine, 9 Schema Registry; state changes behind `adapters:write`, `context:write` or `schemas:write`), plus OT i3X (8) and OT control (15; every POST behind `adapters:write`), plus the curation app mounted at `/curation` |
| Storage migrations | 12 (core schema, spoke schemas, canonical, TimescaleDB, lineage, contextual records, adapter registry, module permissions, registry and equipment tables, data-product curation spec, contextual-record context columns, spoke roles without login) |
| FACTS specs | 9 (8 validate against the schema and pass the runner; ot-module fails `facts:schema-valid` + 8 vocabulary checks, FB-079); 6 await owner approval after the FB-080 and FB-074 re-stamps (`forge governance specs --pending`) |
| FATS specs | 28 (one per route the hub app serves; the hub test holds both directions) |
| FVTS specs | 1 (ot-module reference, `pending_review`; re-stamped by FB-074 for `REJECTED_REVIEW`) |
| CI jobs | hub-python (installs from `uv.lock` with `uv sync --locked`, FB-096), hub-go, mes-module, secrets-scan; auto-PR workflow; Deploy Tutorial workflow (Node 22; runs the framework's tests, builds the deck and its two gates on every push that touches it, publishes `main` to GitHub Pages at https://reh3376.github.io/forge/; Pages enabled 2026-10-28) |
| Commits | 1,588 (includes the imported MES history) |

---

## 3. Component by component

Legend: ✅ exists and wired · 🟡 exists, partly wired or partly governed · ⬜ not started. Gaps name the backlog item.

### 3.1 Transport and ingest

| Capability | State | Notes |
|---|---|---|
| gRPC `AdapterService`, Python and Go bindings | ✅ | `src/forge/proto`, `src/forge/transport`, `go/gen/forge`; `RecordContext` carries the context field registry's slots (`shift_id`, `event_type`, `event_timestamp`, `work_order_id`) since FB-013 |
| TLS / mTLS hub → spoke and spoke → hub | ✅ | FB-063, FB-072 |
| Per-spoke callback token, scoped hub endpoints | ✅ | FB-063 |
| Push persisted and FACTS-checked at Register | ✅ | FB-053; `forge.ingest`, `forge.ingest.facts_check` |
| Pull: Collect, Backfill, Subscribe/Unsubscribe on the spoke | ✅ | FB-061, FB-071 |
| Hub → spoke write-back (session-bound callback) | ✅ | FB-054 |
| Durable adapter registry and ingest log | ✅ | FB-060, migration 007 |
| FTTS transport spec and runner | 🟡 | Schema + runner exist; spec at `specs/grpc-hardened-transport.ftts.json`; no `docs/FxTS/FTTS.md` |
| Transport parity tests for the Go module | ⬜ | FB-055 |
| Hub is the time authority for its spokes and child hubs; skew measured at every link and enforced | 🟡 | Measured and exposed since FB-089 (2026-10-20): offset per adapter and link (spoke, server, source) from every record and from the OPC-UA probe's `CurrentTime`, on `AdapterHealth.clock`, `GET /v1/ingest/stats`, the OT connection status and OpenTelemetry (`forge.clock.offset`, `forge.clock.out_of_tolerance`), one warning per entry into breach of the provisional `FORGE_CLOCK_TOLERANCE_SECONDS` (1 s). Since FB-094 step 2 (2026-11-13) every OPC-UA service response measures the server's clock too (the response-header tap), the probe cadence is a per-connection runtime setting, and each series is keyed by the clock measured (`clock_id`). Not enforced (FB-093) and no hub time in the contract (FB-092); D-9 signed 2026-11-03 (per-link tolerance classes, six record fields, fields first then the exchange, never silent), implementation in the record's step order |
| Hub stamps `ingestion_time` with its own clock on receipt (gRPC push, pull, REST); the spoke's stamp kept as `sent_time`, none invented | ✅ | `IngestPipeline.ingest` → `stamp_receipt`, one hub-clock reading per batch (FB-087, 2026-10-20); `sent_time` is hub-local and becomes `spoke_time` under D-9 (signed 2026-11-03) when FB-092 lands |
| No record builder invents a source time: a value without a source stamp is refused unless its connection declares `source_timestamp_origin: forge`; then Forge's read time stands in and the record says so (`source_clock`, `source_uncertainty_seconds`); the refusal is on health, status, API, CLI and the `forge.ingest.refused` metric | ✅ | FB-088 (2026-11-13, D-9 step 1): `forge.core.clock.resolve_source_stamp` behind the OPC-UA converter and tag registry, the nine adapters and the BOSC collectors, the Ignition bridge, `IngestPipeline.coerce` and the interim MES bridge mapper; the declaration is a per-adapter config field, a per-connection OT adapter param or manifest metadata until FB-090 puts the FACTS `time_governance` section in place; at rest the hypertable still keeps only `source_time` (FB-108) |
| Every timestamp Forge stores is UTC and timezone-aware; a naive datetime or an offset-less string is rejected at the model | ✅ | `forge.core.clock` (`utc_now`, `require_utc`, `OneClockModel`) behind `RecordTimestamp`, every manufacturing entity, `DataProduct` and the decision models; no `utcnow` left; ruff `DTZ` blocking (FB-014, 2026-10-20). The OT module's `DataValue`/`TagValue` still coerce naive to UTC (OPC UA `DateTime` is UTC by definition) and the adapters read an offset-less source string as UTC until FB-090 declares it per spoke |

### 3.2 Hub platform

| Capability | State | Notes |
|---|---|---|
| Hub REST API (adapters, records, writes, subscriptions, backfill, collect, ingest log, info/health) | ✅ | `src/forge/api/main.py` |
| Curation service mounted | ✅ | `/curation`; one curation engine builds each data product's pipeline from its `CurationSpec` and runs it on ingest for the published products the adapter feeds, curated records persisted with the raw ones (FB-009, 2026-10-22) |
| Context Engine (F21) and Schema Registry (F20) | ✅ | Served by the hub under `/v1/context` and `/v1/schemas` (FB-001); Postgres stores through the factory, migration 009 (FB-005); both 2026-10-22 |
| Gateway: auth, RBAC, rate limiting | 🟡 | Middleware exists; auth off by default; only state-changing routes carry a scope (`adapters:write`, `context:write`, `schemas:write`), reads are open (FB-007) |
| Access controller persistence | ✅ | `PersistentAccessController` over `forge_core.module_permissions` / `access_audit` (migration 008), handed out by the storage factory and run by `forge db access` (FB-003, 2026-10-22) |
| Registry/equipment tables in Postgres | ✅ | Migration 009 (FB-005, 2026-10-22) |
| Observer | 🟡 | Package exists; no SLO/FOTS wiring |
| CLI `forge` | ✅ | adapter list/status, governance run/validate-spec, migrate up/status/down, db access grant/revoke/list/issue |

### 3.3 Storage

| Capability | State | Notes |
|---|---|---|
| Engines: PostgreSQL, TimescaleDB, Neo4j, Redis | ✅ | `forge.storage.engines` |
| Storage router and factory | ✅ | |
| Schema references: one grammar (`forge://schemas/<spoke>[/<Entity>][/v<version>]`), three roles, held at every boundary | ✅ | `forge.core.schema_ref` (FB-008, 2026-10-22); the two registries themselves are not converged: FB-097's design record, `docs/decisions/one-schema-registry.md` (D-10), signed 2026-11-03; its eight steps follow |
| Versioned migrations (12) | ✅ | Online runs through asyncpg on SQLAlchemy's async engine (FB-003); 008 replaces the two 001 tables it had collided with; 011 gives `forge_ts.contextual_records` one column per `RecordContext` slot (FB-013); 002's downgrade drops what each spoke role holds before the role, so a full downgrade runs to base (FB-098, 2026-10-26); 002 creates the spoke roles `NOLOGIN` and 012 closes the placeholder login on a database that applied 002's earlier text, unless Forge issued the role (FB-099, 2026-10-26); 006's downgrade removes the `forge_ts` schema, so a downgrade to base leaves only Alembic's version table (FB-101, 2026-10-27; FB-100 recorded, waits on FB-057 step 2) |
| Forge-issued module database credentials (`forge db access`) | ✅ | FB-057 step 1, migration 008, on the persistent controller since FB-003; password printed once, never stored |
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

The FACTS runner validates every spec against the JSON schema first (`facts:schema-valid`, FB-080) and reads its enums from the schema; 8 of 9 specs validate, the OT spec waits on FB-079 (D-8 decided 2026-11-03: extend the enums).

### 3.5 OT module (forge-ot)

| Capability | State | Notes |
|---|---|---|
| OPC-UA client (asyncua), tag engine, context resolvers | ✅ | `forge.modules.ot.opcua_client`, `tag_engine`, `context`; asyncua pinned `==2.1.0` (FB-085) |
| Tag `source_time` is device time corrected to master by the device's measured clock offset, original stamp and offset recorded | 🟡 | No source time is invented since FB-088 (2026-11-13): a value the server did not stamp is refused unless the connection declares origin `forge`, and the record names the stamping clock once declared. The server's clock is read since FB-094 step 2 (2026-11-13): on every OPC-UA response and on the probe cadence, keyed by the clock measured; no offset is applied yet (step 3; one-clock principle, owner 2026-10-18); design record `docs/decisions/one-clock-ot-source-time.md` drafted 2026-10-21, signed 2026-11-03; implementation in its step order, steps 3 and 6 next |
| ISA-18.2 alarming (state machine, detector, engine, integrations, API) | ✅ | `forge.modules.ot.alarming` |
| Control writes: validation → review → interlocks → authorization → write with read-back → audit | ✅ | `forge.modules.ot.control`; audit in the hub store and an external MQTT publisher (FB-066, FB-067) |
| MES changeover: orchestrator, PLC CIP runner, recipe integration, REST | ✅ | FB-062, FB-065 |
| Hosted in the hub with PLC connections, supervision, liveness | ✅ | FB-069, FB-070; `forge.modules.ot.host` |
| i3X REST shape, MQTT ingress, Ignition bridge (read-only parallel run) | ✅ | `i3x`, `mqtt`, `bridge` |
| Scripting SDK replacing `system.*` | ✅ | `forge.sdk.scripting` |
| Server-side two-step review and reason codes for writes | ✅ | FB-074 (2026-10-17): `WriteReviewer`, stage/commit REST behind `adapters:write`, `REJECTED_REVIEW`; multi-party approval follows FB-075 (D-1 signed 2026-11-03) |
| OT control changeover/connection POST endpoints behind a hub scope | ✅ | FB-082 (2026-10-17): `adapters:write` on confirm-start, retry-recipe, resume and connection restart; the hub user is the actor on the MES write, audit record and events |
| Batch context resolver wired to MES | ⬜ | FB-020 |
| One adapter identity (code says `forge-ot-module`, manifest and spec say `ot-module`) | ⬜ | FB-079 (includes FB-018) |

### 3.6 forge-mes

| Capability | State | Notes |
|---|---|---|
| NestJS backend + Next.js frontend imported as the bridge | ✅ | `modules/Forge MES`; spoke speaks the contract (push, pull, Collect, token, TLS) |
| Go rewrite from the module SDK | ⬜ | FB-076; design record signed 2026-11-03 (D-3, `docs/decisions/forge-mes-go.md`): ten steps, the Go SDK scaffold (FB-017) first |
| Prisma data into the hub's `mod_mes` | ⬜ | FB-057 steps 2–5 |
| Frontend retired in favour of forge-display | ⬜ | after forge-display exists |

### 3.7 Module SDK and Go

| Capability | State | Notes |
|---|---|---|
| Python module builder (manifest builder, scaffolder, generators, `forge module init`) | 🟡 | Adapter-style, backend-only templates (FB-017); duplicate SDK copies drift (FB-019) |
| Go models mirroring the core models | ✅ | `go/internal/models` (1,800 lines, 1,488 of tests); `Lot.item_id` (FB-010) and the `RecordContext` slots (FB-013) with the Python models; every manufacturing entity has a `New*` constructor with the Python defaults and a `Validate()`, held equal to the Python models by one fixture both suites read (FB-016) |
| Go scaffold | 🟡 | `go/internal/scaffold` (112 lines); not a module template yet |
| `forged` daemon, `forgectl` | ⬜ | 22- and 36-line placeholders |
| Template module copies (`modules/Forge CMMS`, `Forge ERPI`, `Forge DB Orchestration`) | 🟡 | adapter templates, not Go modules |

### 3.8 forge-display and FVTS

| Capability | State | Notes |
|---|---|---|
| FVTS v0.1.0 schema, 19-check runner, render-profile baseline, reference renderer, golden messages, CI gate | ✅ | FB-077 (PR 36); `src/forge/governance/fvts`, `tests/governance/fvts` |
| OT reference FVTS spec with real tags, owner-approved | ⬜ | FB-078 (invented fermenter points today; `pending_review`) |
| forge-display runtime (any profile) | ⬜ | no code; no backlog id until the design lands |
| FVTS open decisions (name, write authority per profile, mobile acknowledge, transport, layout format) | ✅ | D-4 decided 2026-11-03, recorded in `docs/FxTS/FVTS.md` ("Decisions") |

### 3.9 Governance (FxTS)

| Framework | State |
|---|---|
| FATS | schema + runner + 28 specs (one per hub-served route) |
| FACTS | schema + runner (`facts:schema-valid` + 35 rule checks, enums read from the schema) + 9 specs; 8 validate (OT spec: FB-079); 5 re-stamped specs await owner approval |
| FHTS | hashing, verification, approval, revert, registry; owner-only approval in practice |
| FTTS | schema + runner + 1 spec; no doc page |
| FVTS | schema + runner + reference renderer + 1 spec |
| FQTS, FSTS | stubs |
| FDTS, FLTS, FNTS, FOTS, FPTS | planned (doc pages only) |
| Spec integrity CLI (`forge governance specs`, `stamp`, `approve`) and `forge governance run` for FATS, FACTS, FVTS, FTTS | ✅ FB-021, FB-083 (2026-10-18) |

### 3.10 Security, identity, topology

| Capability | State | Notes |
|---|---|---|
| Role model designed in dialogue (R-1 … R-19) | ✅ | `docs/decisions/roles.md`, signed 2026-11-03 (Q21: a derived copy of assignments at the site hub; Q22: the ladder as an optional preset); enforcement is FB-075 |
| Scoped roles enforced in the gateway | ⬜ | FB-075 (two role enums today: gateway `Role`, OT `WriteRole`) |
| Identity methods (OIDC, local, service; then LDAP/AD; then SAML) | ⬜ | R-10 |
| Hub of hubs (site / enterprise / area), upward audit, on-demand data | ⬜ | R-9, R-13, R-14, R-16, R-17; no code |
| Offline token verification, one-hour default lifetime | ⬜ | R-8, R-15 |
| Repository hardening | 🟡 | public again since 2026-10-17 (owner's call, ahead of Support's GC); secret scanning, push protection, CodeQL default setup, Dependabot, private vulnerability reporting and fork-PR approval on; gitleaks in CI; the 4 open secret-scanning alerts are the rotated whk-mes values still reachable through `refs/pull/4..8` until Support GCs (ticket #4862642); non-provider patterns and validity checks are owner toggles the API refuses (FB-044) |

### 3.11 Deployment and operations

| Capability | State | Notes |
|---|---|---|
| Docker Compose (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, minio, forge-init, forge-hub) | ✅ dev only | `deploy/docker` |
| Hub container image | ✅ | `deploy/docker/Dockerfile.forge`, built from `uv.lock` with `uv sync --locked` (dependency layer before the source, `ot` extra in, dev tooling out; `.dockerignore` keeps the context to what it copies) since FB-096 (2026-10-24) |
| Hub health probes (`/v1/health`, `/readyz`) | ✅ | All seven compose-stack components (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, minio) since FB-006 (2026-10-22) |
| Kubernetes production deployment | ⬜ | owner note; no backlog id |
| Backups, SLOs, performance baselines | ⬜ | FOTS/FPTS planned |

### 3.12 Engineering platform

| Practice | State |
|---|---|
| One backlog item per PR, auto-PR, owner merges on green | ✅ (A-8) |
| Every finding fixed or recorded in `BACKLOG.md` | ✅ (109 items recorded to date) |
| Documentation current before every push | ✅ rule since 2026-10-16 |
| Owner-only spec approval | ✅ `forge governance approve <spec> --by reh3376` (FB-021); nobody runs it on the owner's behalf |
| MDEMG/Jiminy governed memory, local models only | ✅ instance per project (A-10) |
| Lint gate | ✅ `ruff check` and `ruff format --check` clean and blocking since FB-022 (2026-10-18), no rule ignored since FB-084, `DTZ` (no naive datetimes) blocking since FB-014 (2026-10-20); jest/tsc gates on the interim NestJS/Next.js code still advisory (FB-048; they go when FB-076 retires that code) |
| Dependency lock | ✅ `uv.lock` committed (FB-096, 2026-10-24); CI, the hub image and the README quick start install with `uv sync --locked`, which fails on a stale lock, so a dependency moves only through a committed re-lock; Dependabot proposes Python bumps on the `uv` ecosystem, manifest and lock together (FB-102); `tests/test_dependency_lock.py` holds the lock to the manifest and the installers to the lock |
| Top-level documents are the key documents only | ✅ FB-081 (2026-10-18): twelve planning records retired, rationale in `docs/PRINCIPLES.md` |
| Onboarding tutorial | ✅ FB-103 (2026-10-27): `docs/tutorial.md` (contributor track F1–F10, end-user track U1–U11, 19 diagrams, speaker notes) rendered by the vendored tutorial-forge into `build/tutorial-static/` (gitignored); `make sync-tutorial-embed`, the drift gate and the FSD invariants check run locally and in the Deploy Tutorial workflow; live at https://reh3376.github.io/forge/ since 2026-10-28 (the owner enabled Pages; the live page passes the FSD §16.5 invariants and its breadcrumb matches the deck); framework tutorial-forge 1.1.0 since 2026-11-03 (FB-104 and FB-105 fixed upstream in mdemg and re-vendored) |

---

## 4. Open decisions (owner)

On 2026-11-03 the owner decided D-1, D-3, D-4, D-8, D-9 and D-10, one question at a time, and signed the four records; D-5 and D-7 remain open.

| # | Decision | Blocks |
|---|---|---|
| D-1 | Platform role model — **signed 2026-11-03** (`docs/decisions/roles.md`, R-1 … R-19) | nothing; FB-075, FB-078 and the multi-party approval step above FB-074 can start |
| D-3 | forge-mes Go design — **signed 2026-11-03** (`docs/decisions/forge-mes-go.md`, round 2) | nothing; FB-017 (Go half), FB-076, FB-057 steps 2–5 and FB-055 can start, in the record's step order |
| D-4 | FVTS open items — **decided 2026-11-03** (`docs/FxTS/FVTS.md`, "Decisions") | nothing; forge-display design can start |
| D-5 | Hub core language (Python vs Rust) — parked | nothing in the current sequence |
| D-7 | Scope of the Go standard (OT module and Python adapters) | long-term shape of `src/forge/modules` and `src/forge/adapters` |
| D-8 | FACTS vocabulary for OT adapters — **decided 2026-11-03**: extend the enums (option a) | nothing; FB-079 can start, then the OT FACTS spec's approval |
| D-9 | One clock: which established standards to adopt — **signed 2026-11-03** (`docs/decisions/one-clock-ot-source-time.md`, round 2: tolerance classes, six record fields, `origin: forge` allowed, 30 s default cadence adjustable at runtime, NTP with T0 acceptable, fields first then the exchange, never silent) | nothing; FB-088 and FB-090 to FB-094 in the record's step order |
| D-10 | One schema registry — **signed 2026-11-03** (`docs/decisions/one-schema-registry.md`, round 2) | nothing; FB-097's eight steps |

---

## 5. Largest gaps against the vision

1. **No forge-display** (vision §P-8): the contract and runner exist; the renderer does not.
2. **No management module in Go** (vision §3.3): the migrated NestJS/Next.js application stands in for forge-mes until the Go module is built; the SDK template does not exist yet.
3. **No scoped roles in force** (vision §P-11): the gateway's auth is off by default and the role model is still being designed.
4. **No federation** (vision §P-10): a single hub only; no hub-of-hubs code.
5. **Seven governance frameworks are stubs or planned**; FACTS now validates against its own schema, but six of its nine specs await the owner's hash approval.
6. **No production deployment** (vision §P-12).
7. **No clock discipline** (principle "one clock", owner 2026-10-18): the hub is not a time authority for anything attached to it, nothing refuses a wrong clock yet, and a tag's source time is whatever the OPC-UA server chose to send (FB-090 to FB-094; no source time is invented since FB-088 on 2026-11-13, a value without one is refused unless the connection declares origin forge; naive timestamps are rejected since FB-014, the hub stamps receipt since FB-087 and every link's offset is measured and alerted since FB-089, all 2026-10-20).

---

## 6. How to update this page

Before a push that changes any row above: change the row, the numbers in §2 if they moved, and the status date. If a decision in §4 is taken, move it to `ROADMAP.md` §1 and remove it here. New gaps get a backlog id first, then a row.
