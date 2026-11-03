# forge-mes in Go — design record

**Status:** approved by reh3376 on 2026-11-03 (round 2: the owner answered Q-1 to Q-10 one at a time on 2026-11-03 and declared the answers the signature; the status line was set on that word; §7 records the answers) · **Backlog:** FB-076 (with FB-057 steps 2–5, FB-017, FB-055, FB-011, FB-012; FB-106 and FB-107 recorded from the answers) · **Roadmap:** D-3
**Participants:** reh3376 (owner, decides and signs), Claude (researches, proposes)

This record designs the rewrite of forge-mes in Go: what the Go module carries on day one, what the interim MES bridge (the NestJS/Next.js code under `modules/Forge MES`) keeps doing until cut-over, how the bridge's data moves into the hub's `mod_mes` schema, whether GraphQL survives, and the shape of the module SDK the module is generated from, since this module is the SDK's first consumer. Every statement is tagged **[OWNER]** (decided by the owner, with the date), **[FACT]** (what the code says, with its source in §8), **[PROPOSED]** (Claude's recommendation, not yet approved) or **[OPEN]** (a question for the owner, collected and answered in §7). Nothing was implemented before the signature; implementation follows it, one step per PR (§6).

---

## 1. What the owner decided

| # | Decision | Source |
|---|---|---|
| A-2 | Formal `forge-<management service>` modules share one language and structure: **Go**, generated from the module SDK template, for speed and native gRPC. forge-mes must not be JS/TS; the imported NestJS + Next.js code is a bridge to be rewritten. | **[OWNER]** 2026-10-16, `ROADMAP.md` §1 |
| A-3 | All user interfaces come from forge-display. Modules describe (FVTS); no module ships its own UI. | **[OWNER]** 2026-10-16 |
| A-5 | A module SDK is required so management and integration modules are built the same way (Go scaffold, manifest, FACTS spec, tests). | **[OWNER]** 2026-10-16 |
| A-6 | The hub owns the databases. Modules do not own database connections; MES data moves into the hub's `mod_mes` schema (FB-057). | **[OWNER]** earlier |
| A-7 | Safety stays in the core: role checks, interlocks, confirmation and audit for writes are enforced in forge-core/OT, never only in a UI. | **[OWNER]** 2026-10 |
| A-10 | Local models only for Forge tooling; no OpenAI cloud models. | **[OWNER]** earlier |
| Module rule | Each module has a **backend** section (the standard backend code including the forge-core integration) and a **frontend** section (the UI). | **[OWNER]** 2026-10-15 |
| R-5, R-12 | Roles are authored per module at module setup; shipped roles are per module, as data; a universal ladder is at most an overlay. Modules never implement their own permission checks: the SDK provides `Authorize(subject, scope, context)`. | **[OWNER]** 2026-10-16, `docs/decisions/roles.md` |
| D-7 | Whether the hub-hosted Python OT module and the Python adapters follow the Go standard is open; this record assumes they stay Python. | **[OPEN]** `ROADMAP.md` §5 |

The one-clock principle (2026-10-18, D-9) applies to the module as to every spoke: it takes time from its hub, declares its time governance in FACTS once FB-090 lands, and fails closed. **[OWNER]**

**Round 2 (2026-11-03).** The owner answered Q-1 to Q-10 (§7) one at a time and declared the answers the signature. Every **[PROPOSED]** statement in §4 to §6 is thereby **[OWNER]** 2026-11-03, as amended by §7: P-5 gains a GraphQL gateway module of the hub (FB-106), P-3 carries the owner's wording on the broker, P-8 records FB-107. Two standing rules came with the answers and bind every step below: **no silent failure** (a refusal or fail-closed state raises an alarm at once and is visible on status, health, API, CLI and forge-display) and **no decision that pins the platform in** (§7 carries a debt note per answer; a second hand-maintained model, a module-local shortcut around the hub or a report-only gate is ruled out).

## 2. What exists today (2026-11-03)

### 2.1 The interim MES bridge (`modules/Forge MES`) **[FACT]**

- **Backend:** NestJS 10 with Prisma. 97 source directories, about 85 Nest modules; 221 `*.base.ts` files are Amplication-generated CRUD scaffolding. Domain modules group into production/batch (production orders, batches, step and mashing execution, material consumption, parameters, time series, operator shifts, yield estimation), recipe/formula on the ISA-88 model (recipes, BOMs, procedures, unit procedures, operations, equipment phases, phase parameters, mashing protocols, formula library and assistant, enzyme and grain configuration, whiskey types), inventory/commercial (items, lots, receipts, transfers, vendors, customers, purchase and sales orders), equipment (assets, equipment state, changeover), quality (batch deviation, lab tests), scheduling (schedule orders and queue), auth/users, and integration (forge, RabbitMQ, ERP sync, MQTT domain publisher and rules, UNS broker configuration).
- **Data:** `backend/prisma/schema.prisma`: 84 models, 56 PostgreSQL enums, about 38 JSON columns, 72 migrations (2024-07 to 2026-02, about 420 KB), four SQL functions and four triggers (lot and recipe whiskey-type sync, complete-lot update/delete protection), five raw-SQL call sites, no views. One datasource `DB_URL` in the default `public` schema; no `@@schema`. The bridge owns its DDL (Prisma migrate).
- **API:** GraphQL (Apollo, code-first, 70 hand-written resolvers) and REST (71 controllers, Swagger, `openapi.json`); no GraphQL subscriptions; socket.io gateways `/mqtt` (broker relay to the UI) and health; cron jobs for certificate rotation and message-queue retries; 12 RabbitMQ event handlers plus a `sync` message handler.
- **Changeover state machine** (`backend/src/changeover/`, service of 1,013 lines): states PRODUCTION, COOK_COMPLETE, AWAITING_CHANGEOVER, CIP_IN_PROGRESS, CIP_COMPLETE, RECIPE_LOADING, RECIPE_LOADED, READY_TO_START, ERROR; one machine per area (cooker, fermentation, barreling; only the cooker is hydrated from the global queue at start). Transitions: PRODUCTION → COOK_COMPLETE or AWAITING_CHANGEOVER; COOK_COMPLETE → AWAITING_CHANGEOVER; AWAITING_CHANGEOVER → CIP_IN_PROGRESS or CIP_COMPLETE; CIP_IN_PROGRESS → CIP_COMPLETE → RECIPE_LOADING → RECIPE_LOADED → READY_TO_START → PRODUCTION; ERROR → AWAITING_CHANGEOVER or CIP_COMPLETE. Commands `request`, `cip-complete` (auto-advances to RECIPE_LOADING), `recipe-loaded` (auto-advances through RECIPE_LOADED to READY_TO_START), `start-production` (advances the schedule-order queue), `reset`; `GET :area/state` and `:area/next-recipe`. No command enters COOK_COMPLETE or CIP_IN_PROGRESS; they are accepted only as starting states. Each transition runs under a per-area promise mutex, persists `ChangeoverAreaState` (one row per area, cached), an `AuditLog` row, `Asset.operationalState` and an `EquipmentStateTransition`, and publishes to the first connected broker under `whk/whk01/{area}/`: `changeover/state`, `queue/activeOrder`, `queue/nextOrder`, `queue/state`, `queue/depth`, `recipe/next`, `recipe/updatedAt`.
- **MQTT:** `providers/mqtt/mqtt.service.ts` (1,300 lines) over the `mqtt` v5 package: multiple brokers from the `UnsBrokerConfiguration` table, per-broker topic ACLs, TLS, certificate rotation. Incoming messages feed the UI gateway only; no domain logic consumes them. `mqttDomainPublisher` publishes by the `MqttEventPublishRule` table (templates such as `whk/mes/{area}/{entityType}/{eventType}` and `whk/mes/{area}/deviation/{severity}/{batchId}`) from schedule-order, production-order, production-event, step-execution, mashing-execution and batch-deviation services, and forwards each event to the Forge ingest service.
- **Forge integration** (`backend/src/forge/`, 2,734 lines, opt-in with `FORGE_HUB_ENABLED=true`): hub client (Register, Configure, Start, Stop, Health, client-streaming Ingest with `x-forge-adapter-id` and `x-forge-session-id`), session lifecycle with backoff, a bounded ingest queue (batches, retry, circuit breaker, dead letter), the domain-event → `ContextualRecord` mapper mirroring the hub's Python adapter (schema ref `forge://schemas/forge-mes/v0.1.0`), the spoke server the hub dials (Write, Discover, Health, Backfill, Subscribe, Unsubscribe, Collect) checking the callback token, a write-target registry whose only target is `ChangeoverForgeWriteTarget` (prefix `mes.changeover`), backfill replaying `AuditLog` rows, the manifest and protos vendored with a parity test, `GET /forge/status` and `/forge/tags`. Env: `FORGE_HUB_GRPC_URL` (default `localhost:50051`), `FORGE_HUB_TLS_*`, `FORGE_ADAPTER_ID` (`forge-mes`), `FORGE_SITE` (`whk01`), `FORGE_AREA` (`distillery01`), ingest batch/flush/queue sizes, `FORGE_SPOKE_GRPC_BIND` (`0.0.0.0:50052`), `FORGE_SPOKE_GRPC_ADVERTISE_URL`, `FORGE_SPOKE_REQUIRE_TLS`, `FORGE_SPOKE_CALLBACK_TOKEN`.
- **Frontend:** Next.js 14.2 (not 15) with React 18, app router, 68 pages: a 726-line tabbed dashboard, operations (BOM consumption, mashing execution), recipe management, scheduling, 15 configuration pages (assets, audit trail, bins, enzyme dosing, formulas, grain characters, mashing templates and parameters, MQTT brokers and publish rules, metrics, recipe parameters, units), and about 40 debug, diagnostics and demo pages; 12 API routes (GraphQL and REST proxies, enzyme routes, health, env debug). Data through Apollo (60 files), react-query, socket.io, zustand; login through Azure MSAL. `shared/` (219 lines) is imported only by two smoke files.
- **Tests:** 133 backend spec files (54 generated), three e2e specs whose config and script are broken, 9 frontend unit tests, 7 Playwright specs, an e2e workflow under compose. Jest in CI: 5 suites fail (FB-036), the step is advisory (FB-048).
- **External systems:** ERP via RabbitMQ (`RABBITMQ_URLS`, topics `wh.whk01.distillery01.*`, upserts through `sync.service.ts`, retry crons on a `MessageQueue` table; NetSuite behind it), Azure Communication Email, Azure Key Vault (MQTT credentials), Azure AD/MSAL (frontend) with backend-issued JWTs, OpenAI and OpenRouter for the formula assistant, the Daytona sandbox SDK, Redis cache, New Relic and OpenTelemetry, deploys to fly.io (`whk-mes-staging`), Vercel, a Helm chart and a Raspberry Pi image. **Ignition** calls the REST changeover endpoints and the GraphQL mutation `advanceScheduleOrderQueue`.

### 2.2 The hub side **[FACT]**

- `forge.v1.AdapterService` has twelve RPCs: Register, Configure, Start, Stop, Health, Ingest (client stream), Collect, Subscribe, Unsubscribe (server streams), Write, Backfill, Discover. The hub serves the hub half with TLS/mTLS (FB-072) and dials the spoke half with the per-spoke callback token and TLS (FB-063); `WriteDispatcher`, the pull RPCs and Collect are wired (FB-054, FB-061, FB-071); Ingest runs through `forge.ingest.IngestPipeline` (validate → router → sinks; FACTS conformance at Register) into `forge_ts.contextual_records` (FB-053, migration 006); the registry is durable (FB-060). The Python and Go proto copies differ only in `go_package`.
- The forge-mes FACTS spec (`src/forge/governance/facts/specs/forge-mes.facts.json`, v0.1.0) is approved (hash `95ca14f6…`, 2026-10-16): identity type INGESTION, tier MES_MOM, protocol `graphql+amqp+mqtt`; capabilities read, write, subscribe, backfill, discover; six required context fields (`production_order_id`, `batch_id`, `recipe_id`, `equipment_id`, `event_timestamp`, `event_type`) and ten optional; 15 context mappings; retry 5× exponential, circuit breaker 5/45 s/2, dead letter `forge.dead-letter.forge-mes`; a lifecycle whose triggers name GraphQL, AMQP and MQTT; metadata describing the TypeScript source. The Python adapter `forge.adapters.forge_mes` mirrors the mapping for 29 event types (`batch.*`, `production.*`, `step.*`, `phase.*`, `mashing.*`, `equipment.*`, `inventory.*`, `quality.*`, `parameter.*`).
- The hub-hosted OT module depends on the MES through the write tags `mes.changeover.<area>.<command>` (area ∈ cooker, fermentation, barreling; command ∈ request, cip-complete, recipe-loaded, start-production, reset) with a read-back on `mes.changeover.<area>.state` (`MesChangeoverClient`), and through the topics `changeover/state` and `recipe/next` on the hub's embedded broker (`ChangeoverOrchestrator`, `LocalBrokerIngress`). The hub's broker (`forge.core.broker`) has no bridge to external brokers; the OT module's `OTMqttPublisher` publishes outward through aiomqtt.
- Storage: migration 002 creates the `mod_mes` schema and the `forge_mod_mes` role (NOLOGIN until Forge issues a credential, FB-099); FB-057 step 1 issues credentials (`forge db access issue`, password printed once, `...?schema=mod_mes`); FB-100 records that the spoke roles' read grant on `forge_core` is partial; FB-004 that the router's shadow namespace is named `spoke_<id>`. FDTS (schema evolution) is a planned stub (`docs/FxTS/FDTS.md`).
- Canonical model: `forge.core.models.manufacturing` (BusinessEntity, MaterialItem, ManufacturingUnit, OperationalEvent, Lot, ProductionOrder, ProcessStep, ProcessDefinition, PhysicalAsset, QualitySample, SampleResult, WorkOrder, WorkOrderDependency) mirrored in Go (`go/internal/models/manufacturing`, one parity fixture, FB-016). FB-011 lists what an MES needs and the model lacks (step/phase execution, electronic batch record, genealogy/consumption, OEE and downtime reasons, personnel, nonconformance/deviation, spec limits, e-signatures, inventory transactions, UoM conversion); FB-012 the untyped ISA-88 hierarchy. The entity catalog defers MashingProtocol, FormulaLibrary, EnzymeConfiguration, UNS configuration, FermenterAssignment, ChangeoverAreaState and BatchDeviation to the adapter layer.

### 2.3 The Go tree and the SDK **[FACT]**

- `go/` is one Go module, `github.com/reh3376/forge`, Go 1.26, dependencies connect-go 1.21, protobuf 1.36, cobra, uuid. `go/gen/forge/v1` holds the generated messages and the Connect client and handler interfaces for all twelve RPCs; `go/internal/models` the adapter, contextual-record, data-product, decision and manufacturing models with converters; `go/cmd/forged` is a 22-line stub ("hub daemon not yet wired") and `go/cmd/forgectl` a 36-line cobra root; six test files; CI job `hub-go` runs `go build ./...` and the tests. The G-series "Go hub migration" (G0, G1) was superseded by A-2: the hub stays Python (D-5 parked) and the G0/G1 output carries into the SDK.
- The SDK today is Python only: `forge module init` emits an adapter-style, backend-only Python template whose FACTS output does not match hand-written specs (FB-017). There is no Go template, no `hublink` library, no module layout.

## 3. The problem, precisely

1. The bridge contradicts A-2 (TypeScript), A-3 (its own UI), A-6 (it owns its database and DDL in `public`), A-7 (its own JWT/ACL layer) and A-10 (OpenAI calls), and carries debt the roadmap triages only for safety (FB-028, FB-036, FB-050, FB-052, FB-031, FB-043, FB-045). Its forge integration, by contrast, is the stable interface the Go module targets (FB-034, FB-054, FB-061, FB-063, FB-071). **[FACT]**
2. Three consumers depend on the bridge today and must not notice the rewrite: the OT module (changeover tags and topics), Ignition (REST changeover commands and the GraphQL queue advance) and the ERP sync that keeps master data current over RabbitMQ. **[FACT]**
3. D-3 asks: what the Go module carries on day one, what stays in the bridge until cut-over, how the Prisma data moves into `mod_mes`, and whether GraphQL survives. Because the module is the SDK's first consumer, the SDK's shape and the module layout are decided with it (roadmap §4 step 2 lists "module SDK shape" in the same session). **[FACT]**

## 4. Options considered

- **O-1 Port everything at once.** 84 models, 70 resolvers, 71 controllers and 68 pages rewritten before any cut-over. Months without a verifiable step, parity verified only at the end. Rejected. **[PROPOSED]**
- **O-2 Strangler by capability behind the hub's contract.** The hub's `AdapterService` and the write-tag namespace are the seam: each capability moves to the Go module with its parity test, consumers are repointed one at a time, and the bridge shrinks to what has not moved (its UI until forge-display, its ERP consumer until the ERP spoke carries the entities). Recommended. **[PROPOSED]**
- **O-3 A Go façade in front of the NestJS backend.** Satisfies the letter of A-2 only; the data, DDL and UI stay where they are. Rejected by A-2's reason (speed, native gRPC) and by A-6. **[PROPOSED]**

## 5. Proposed design

### P-1 Layout and the SDK shape — [OWNER 2026-11-03] (Q-1)

The module lives inside the repository's one Go module, generated by the SDK, honouring the owner's two-section rule:

```
go/
  sdk/                      the module SDK (library + generator)
    hublink/                session (Register/Configure/Start/Stop/Health), Ingest queue with the FACTS
                            error-handling policy, the spoke server (Write/Discover/Health/Backfill/
                            Subscribe/Unsubscribe/Collect) with callback token, TLS from env
    module/                 lifecycle, config loading (env + JSON file), slog, /healthz, graceful stop
    store/                  Forge-issued credential → pgx pool bound to the module's schema; sqlc helpers
    broker/                 MQTT client to the hub's embedded broker (topic root from config)
    authz/                  Authorize(subject, scope, context) and the shipped-roles loader (R-5, R-12)
    events/                 typed ContextualRecord constructors over go/internal/models
  modules/mes/
    backend/                the Go packages: changeover, schedule, production, recipe, inventory,
                            quality, store (sqlc queries), events (the 29 event types), service wiring
    frontend/               mes.fvts.json and display assets; no code (A-3)
    spec/                   manifest.json, forge-mes.facts.json (parity with the hub's copy),
                            mod_mes.fdts.json, roles.json
    cmd/forge-mes/main.go
  cmd/forgectl/             gains `module init --lang go` (the generator), replacing FB-017's Python-only
                            template for Go modules; the Python scaffold stays for Python adapters
```

Why one Go module and not a `go.work` of many: shared `go/internal/models` and `go/gen` without version skew, one `go test ./...` in CI, one toolchain. The bridge's directory `modules/Forge MES` is retired at cut-over (§6 step 10); it is not reused.

### P-2 The hub link comes first — [OWNER 2026-11-03]

Phase 1 produces a Go `forge-mes` that the hub cannot tell from the bridge: the same adapter id and manifest; the same `ContextualRecord` shape, schema ref and 15 context mappings, so the hub's pipeline, the Python mappers, the registry and every downstream consumer see no change; the spoke half served with the callback token and TLS. The FACTS spec is re-stamped for the new source (protocol `grpc+mqtt`, connection params hub URL, TLS material, spoke bind and advertise URL; the lifecycle triggers stop naming GraphQL and AMQP; metadata names Go) and **re-approved by the owner** (`forge governance approve --by reh3376`, on the owner's word). FB-055 becomes the acceptance test: CI starts the Python hub with `FORGE_GRPC_ENABLED=true` and the Go binary, then Register → Configure → Ingest three records → a Write round trip → Backfill.

### P-3 Day-one functional scope (phase 2) — [OWNER 2026-11-03] (Q-2, Q-3, Q-8)

- **Changeover.** The nine states and the transition table ported verbatim; areas and the site are configuration (`FORGE_MES_CONFIG`: site, topic root, areas), not code; one goroutine per area owning its state (the promise mutex's equivalent); persistence of the area state, the equipment state transition and the audit row in `mod_mes`; the write target `mes.changeover.<area>.<command>` with the read-back on `mes.changeover.<area>.state`, unchanged for the OT module. The two unreachable states stay in the table for parity.
- **Schedule queue advance.** Ignition's GraphQL mutation `advanceScheduleOrderQueue` becomes a write tag, `mes.schedule.<area>.advance`, called through the hub (`POST /v1/adapters/forge-mes/write`, scope `adapters:write`). Ignition changes one call; the GraphQL mutation retires.
- **MQTT publishing.** The changeover topics (`changeover/state`, `queue/activeOrder|nextOrder|state|depth`, `recipe/next`, `recipe/updatedAt`) and the rule-driven domain-event topics (`whk/mes/{area}/{entityType}/{eventType}`, the deviation template) are published to the **hub's embedded broker** under the configured topic root. The OT module already subscribes there. The owner's wording (Q-2, 2026-11-03): the module publishes to the broker module only; from there the connectivity of the broker host determines who and what can subscribe to the topics. Carrying the UNS outward to external brokers becomes a hub feature (a broker bridge, one configuration per broker, built when a site needs it); the bridge's multi-broker client, ACL table and certificate rotation are not ported.
- **Events.** The 29 event types are emitted by the Go services as they are ported (P-9); in phase 2 the module emits the changeover and schedule events and the bridge keeps emitting the rest, each path with its own session, so the hub sees both until cut-over.

### P-4 Data ownership and movement (FB-057 steps 2–5) — [OWNER 2026-11-03] (Q-5, Q-6)

- **Step 2, hub-owned DDL baseline.** One Alembic migration generates `mod_mes` from the Prisma schema: 84 tables, 56 enums, the four functions and four triggers ported as SQL, `cuid` identifiers kept as text for continuity (new rows may use UUIDv7). Its FDTS spec, `mod_mes.fdts.json`, is hashed and approved: the first real FDTS gate (M5). The spoke roles stop reading `forge_core` (FB-100: modules ask the hub, they do not read its tables); the router's shadow namespace is renamed or documented (FB-004).
- **Step 3, canonical mirror.** Events already mirror into `forge_ts` through Ingest. The master entities (items, lots, orders, assets, recipes) are registered in the one schema registry (D-10) with placement `mod_mes`; FB-011 and FB-012 are closed piecewise by FDTS specs derived from the Prisma models (step execution, batch record, consumption, deviation, e-signature, UoM), each its own PR as the matching service is ported (P-9).
- **Step 4, federation.** The hub serves reads of `mod_mes` entities to other modules and to forge-display under the subject's scopes (module-to-module reads run under the module's service identity and are checked against the person's token, roles record §5).
- **Step 5, cut-over of the data.** Same PostgreSQL server: `INSERT … SELECT` per table in one transaction under a short write freeze; different server: `pg_dump` schema-only and data-only with the search path rewritten. Prisma is pointed at `mod_mes` under a Forge-issued **read-only** grant for the bridge's remaining life; the Go module holds the only write credential; the bridge's migrations directory is frozen.
- **Data layer.** pgx v5 and sqlc (compile-time-checked SQL, no ORM); the module ships no DDL, the hub's migrations own it.

### P-5 GraphQL does not survive in the module — [OWNER 2026-11-03, amended] (Q-3, Q-4)

Commands are write tags through the hub (FACTS/FATS-governed, audited, scoped), as changeover is today. Reads are the hub's REST surface (`/v1/modules/forge-mes/…` proxied by the gateway to the module's Connect handlers with the subject's token, or served by the hub from `mod_mes` where it already holds the data) and FVTS data bindings for forge-display (transport per D-4). The bridge's GraphQL keeps serving the Next.js UI until forge-display's MES surfaces land (M4); nothing new is built on it.

**Amendment (Q-4, 2026-11-03).** The owner wants a GraphQL gateway as a **snap-on module of the hub**, serving GraphQL over hub data for any client, so that the bridge's GraphQL retires into it rather than into nothing. forge-mes serves no GraphQL of its own. Debt guard: the gateway's schema is **derived from the one schema registry (D-10) and the hub's REST surface**, never a second hand-maintained model; it serves reads under the subject's scopes and no writes (commands stay write tags). Recorded as FB-106, designed after FB-097 and built when forge-display or an external client first needs it.

### P-6 ERP and the other spokes — [OWNER 2026-11-03] (Q-6)

The RabbitMQ consumer (`wh.whk01.distillery01.*`, NetSuite behind it) is spoke work: the hub has the `whk_erpi` adapter (`amqp+rest+graphql`, tier ERP_BUSINESS). The Go module keeps no AMQP client and reads ERP-owned entities through the hub (Subscribe to the ERP adapter's records, or hub queries) under its service identity. Until the ERP spoke carries those entities, the bridge's consumer keeps writing items, vendors, customers and purchase/sales orders into the reference tables of `mod_mes`, and the Go module treats them as read-only reference data.

### P-7 Identity and authorization — [OWNER 2026-11-03] (Q-10)

The module runs under a service identity (mTLS certificate or client credentials, roles record §4) and checks every command with the SDK's `Authorize`; it ships its domain roles as data (`spec/roles.json`: for example `mes.operator`, `mes.scheduler`, `mes.recipe-engineer`, `mes.quality`, `mes.admin`, scopes `mes:<resource>:<action>`); it has no users, no JWT issuance and no ACL layer of its own (the bridge's `auth` and `user` modules are not ported); its audit records go upward to the hub (R-17). The final shape follows the signed D-1 record (2026-11-03) through FB-075; phases 1 and 2 need only the callback token and the mTLS that exist.

### P-8 What is not ported — [OWNER 2026-11-03] (Q-7)

The Amplication CRUD scaffolding (221 base files; queries are written where a use exists); the formula assistant's OpenAI/OpenRouter calls (A-10: dropped from the rewrite; FB-107 records a local-model assistant, never a cloud model, for later); the Daytona sandbox; Azure Email, Key Vault and MSAL (hub identity and hub secrets instead); Redis; New Relic and the OpenTelemetry module (the hub's observer, FOTS); fly.io, Vercel, Helm and Raspberry Pi deployment (the module is a Pod beside the hub; compose for development only); the forty debug, diagnostics and demo pages; the socket.io gateways (forge-display subscribes through the hub); `shared/`.

### P-9 Phases, parity and cut-over — [OWNER 2026-11-03] (Q-9)

| Phase | Delivers | Acceptance |
|---|---|---|
| 0 SDK | `go/sdk`, `forgectl module init --lang go`, the hub-go CI job running module tests against a PostgreSQL service | the generated module builds, registers against the Python hub in CI |
| 1 Hub link | Register/Configure/Start/Stop/Health, Ingest, the spoke server, the re-stamped FACTS spec | FB-055 green; the spec re-approved |
| 2 OT contract | changeover, schedule advance, MQTT to the hub's broker | the OT module's suite passes against the Go module; Ignition repointed; the bridge's changeover routes disabled |
| 3 Data | `mod_mes` baseline, FDTS gate, data move, bridge read-only | parity queries agree; the Go module holds the only write credential |
| 4 Domain | services and their events in order: schedule and production orders; batches, step and mashing execution; recipes, BOMs, procedures; inventory, lots, items; quality and deviations; ERP entities through the hub | each service: its FDTS spec, its event parity test (audit-log replay), its bridge counterpart disabled |
| 5 Retire | the NestJS backend removed (FB-076 done); the Next.js frontend retires with forge-display (M4) | two weeks of parallel run before the bridge's writes are disabled; no consumer left on the bridge |

### P-10 Deployment and operations — [OWNER 2026-11-03]

One static binary `forge-mes`; `deploy/docker/Dockerfile.forge-mes`; a compose service for development; a Kubernetes Deployment in production (the K8s rule). Configuration by environment plus a JSON file like the OT module's (`FORGE_MES_CONFIG`). Health through the spoke server's Health RPC and `/healthz`; structured logs (slog JSON); metrics and SLOs through the hub's observer (FOTS); the module's clock governed by its hub (D-9).

## 6. Implementation steps (after signature, one PR each)

1. **SDK scaffold**: `go/sdk/{hublink,module,store,broker,authz,events}`, `forgectl module init --lang go`, the hub-go CI job with a PostgreSQL service (FB-017, Go half).
2. **`go/modules/mes` generated**; Register/Configure/Start/Stop/Health and Ingest; the FB-055 acceptance test in CI.
3. **Spoke server** with callback token and TLS; the FACTS spec re-stamped; the owner re-approves the hash.
4. **Changeover** in Go: state machine, write target, persistence, MQTT to the hub's broker; the OT module's tests against it; the bridge's changeover routes disabled.
5. **Schedule queue advance** as a write tag; Ignition repointed; the GraphQL mutation retired.
6. **FB-057 step 2**: the `mod_mes` baseline migration, `mod_mes.fdts.json` and the FDTS gate, the grants (FB-100, FB-004).
7. **FB-057 steps 3 to 5**: registry placement, federation reads, the data move, the bridge read-only.
8. **Domain services** in the order of P-9 phase 4, one PR each with its FDTS spec and event parity (closes FB-011 and FB-012 piecewise).
9. **ERP entities through the hub** (`whk_erpi`); the bridge's RabbitMQ consumer retired.
10. **Retire the NestJS backend** (FB-076 done); the Next.js frontend follows forge-display (M4, D-4).

All ten questions were answered on 2026-11-03; the steps proceed in order, each its own PR, and every refusal or failure they introduce is alarmed and visible (the owner's no-silent-failure rule).

## 7. The owner's answers (2026-11-03)

Asked and answered one at a time; the owner declared the answers the signature. The last column is the debt check the owner asked for: does the answer pin the platform in later?

| # | Question | Owner's answer (2026-11-03) | Pins us in? |
|---|---|---|---|
| Q-1 | Layout: `go/modules/mes/{backend,frontend,spec,cmd}` inside the one Go module, SDK at `go/sdk`, generator in `forgectl` (P-1)? Or a `modules/forge-mes/` root with its own `go.mod` and a `go.work`? | **Inside the one Go module.** | No: one module is the simplest shape; splitting later is a `go.work` and a move, not a rewrite. |
| Q-2 | MQTT: the module publishes only to the hub's embedded broker, and carrying the UNS to external brokers becomes a hub feature (P-3)? The bridge's multi-broker client, ACLs and certificate rotation are not ported. | **Yes.** "Currently to broker module only; from there the connectivity of the broker host will determine who / what can subscribe to the topics." | No: external reach is the broker host's connectivity, a hub concern; nothing module-side to unwind. |
| Q-3 | Ignition's interface: the hub's write endpoint replaces the REST changeover routes and the GraphQL queue advance in phase 2 (P-3, P-5)? | **Yes**, the hub's write endpoint. | No: one Ignition configuration change, governed by FACTS/FATS; no module-local API to retire later. |
| Q-4 | GraphQL: none in the Go module; reads through the hub's REST and FVTS; the bridge's GraphQL survives only for its own UI until M4 (P-5)? | **Amended.** No GraphQL in forge-mes; a **GraphQL gateway as a snap-on module of the hub** serves any client, and the bridge's GraphQL retires into it (P-5 amendment, FB-106). | Guarded: the gateway derives its schema from the one schema registry (D-10); a hand-maintained GraphQL schema would be a second model and is ruled out. |
| Q-5 | Data layer: pgx and sqlc, no ORM; the module ships no DDL, the hub's Alembic migrations own `mod_mes` (P-4)? | **Yes.** | No: sqlc generates from the hub's DDL, so the two cannot drift silently; an ORM would have hidden who owns the DDL. |
| Q-6 | ERP: the bridge's RabbitMQ consumer stays until the `whk_erpi` spoke carries the entities, and the Go module treats ERP-owned tables as reference data meanwhile (P-6)? | **Yes.** | Bounded: transitional duplication ends at step 9 when the `whk_erpi` spoke carries the entities; the tables are read-only reference data meanwhile. |
| Q-7 | The formula assistant (OpenAI/OpenRouter) and the Daytona sandbox: dropped from the rewrite, with a future item for a local-model assistant (P-8)? | **Drop both; record the future item** (FB-107, a local-model assistant, never a cloud model). | No. |
| Q-8 | Site constants (`whk`, `whk01`, `distillery01`, the three areas) become configuration; the two unreachable changeover states are kept for parity (P-3)? | **Yes to both.** | No: configuration, not code; the parity states cost one enum entry each and keep audit-log replay exact. |
| Q-9 | Cut-over criteria: FB-055 green, the OT suite green against the Go module, audit-log replay parity, and a two-week parallel run before the bridge's writes are disabled (P-9)? | **Yes, all four.** | No. |
| Q-10 | Identity: phases 1 and 2 on the existing callback token and mTLS; the service identity and `Authorize` arrive with D-1 (P-7)? | **Yes.** | Bounded: the callback token and mTLS stay the channel identity under D-1 too; `Authorize` is added to the module, nothing is replaced. |

## 8. Sources

- `docs/ROADMAP.md` §1 (A-2 to A-10), §4, §5 (D-3, D-5, D-7, D-9); `docs/WHERE-WE-ARE-GOING.md` §3 (M2 to M4), §4; `docs/VISION.md` §3.3, §3.4.
- `docs/decisions/roles.md` (R-5, R-12, §4 service identities, §5 module-to-module reads, R-17); `docs/decisions/one-schema-registry.md` (D-10, Q-6 placement); `docs/decisions/one-clock-ot-source-time.md` (D-9).
- `BACKLOG.md`: FB-004, FB-011, FB-012, FB-016, FB-017, FB-034, FB-053, FB-054, FB-055, FB-057, FB-060, FB-061, FB-063, FB-071, FB-072, FB-076, FB-099, FB-100.
- The bridge: `modules/Forge MES/backend/src/{changeover,forge,providers/mqtt,mqttDomainPublisher,rabbitmq,sync,auth}`, `backend/prisma/schema.prisma` and `migrations/`, `frontend/app`, `shared/`, `fly.toml`, `backend/helm`, `backend/Dockerfile.pi`.
- The hub: `src/forge/proto/adapter_service.proto`; `src/forge/governance/facts/specs/forge-mes.facts.json`; `src/forge/adapters/forge_mes/{manifest.json,adapter.py,mappers/}`; `src/forge/modules/ot/control/{mes_changeover.py,changeover_orchestrator.py}`; `src/forge/modules/ot/mqtt/{ingress.py,publisher.py}`; `src/forge/core/broker/`; `src/forge/storage/migrations/versions/002_spoke_schemas.py`; `src/forge/storage/access.py`; `src/forge/core/models/manufacturing/`; `docs/core/manufacturing-entity-catalog.md`; `docs/FxTS/FDTS.md`.
- The Go tree: `go/go.mod`, `go/gen/forge/v1/`, `go/internal/models/`, `go/cmd/{forged,forgectl}/main.go`, `go/Makefile`; `.github/workflows/ci.yml` (hub-go); `src/forge/sdk/module_builder/scaffolder.py`.
