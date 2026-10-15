# forge-core integration (backend)

The Forge MES backend is a **spoke** of the forge-core **hub**. This document
describes the backend side of that link (BACKLOG FB-034): how the backend
registers with the hub, how domain events become `ContextualRecord`s, how
failures are handled, and how `mod_mes` persistence is planned.

Code: `backend/src/forge/`. Hub counterpart: `src/forge/transport/` and
`src/forge/adapters/forge_mes/` in the forge repository root.

## Topology

```
MES backend (NestJS)                                forge-core hub (Python)
┌───────────────────────────────┐   gRPC forge.v1.AdapterService   ┌─────────────────────────┐
│ domain services               │ ──Register/Configure/Start────▶ │ GrpcServer (:50051)     │
│   └─ MqttDomainPublisherService│ ──Ingest(stream ContextualRecord)▶│   └─ AdapterServiceServicer│
│        └─ ForgeIngestService   │ ──Health (heartbeat)───────────▶ │        └─ context engine… │
│ ForgeHubService (session)      │ ──Stop(graceful) on shutdown───▶ │                          │
└───────────────────────────────┘                                   └─────────────────────────┘
```

* **Push model.** The backend dials the hub and streams records. The hub's
  gRPC server implements the spoke-to-hub half of `AdapterService`
  (`Register`, `Configure`, `Start`, `Stop`, `Health`, `Ingest`); the
  hub-to-spoke RPCs (`Collect`, `Subscribe`, `Write`, `Backfill`, `Discover`)
  are not served by either side yet (FB-054).
* The hub-side Python adapter (`forge.adapters.forge_mes`) keeps the pull
  contract (GraphQL + RabbitMQ + MQTT) and the same FACTS spec; both paths
  produce identical record shapes.

## Contract

| Item | Where | Notes |
|---|---|---|
| Proto files | `backend/src/forge/proto/forge/v1/*.proto` | Vendored copies of the hub's `src/forge/proto/*.proto`; `forge-parity.spec.ts` fails on drift. Loaded at runtime with `@grpc/proto-loader` (no codegen). |
| Manifest | `backend/src/forge/forge-mes.manifest.json` | Copy of the hub's `adapters/forge_mes/manifest.json`; same parity test. Sent on `Register`. |
| FACTS spec | `specs/forge-mes.facts.json` | Source of the context fields, enrichment rules, retry/circuit/dead-letter policy and lifecycle timings mirrored in code. |
| Routing metadata | `x-forge-adapter-id`, `x-forge-session-id` | Attached to every `Ingest` stream; the hub reads them to find the session. |
| Schema ref | `forge://schemas/forge-mes/v0.1.0` | `lineage.schema_ref` on every record. |

## Flow

1. **Startup.** `ForgeHubService.onModuleInit` returns immediately. If
   `FORGE_HUB_ENABLED=true` it runs the handshake in the background with
   exponential backoff (1 s → 30 s) until the hub answers:
   `Register(manifest)` → session id → `Configure(connection params)` →
   `Start` → state `healthy`.
2. **Heartbeat.** `Health` every `FORGE_HEALTH_INTERVAL_MS` (15 s). Three
   consecutive failures mark the session `degraded`, eight mark it `failed`
   and trigger a fresh handshake (FACTS `health_degradation`).
3. **Events.** Every call to `MqttDomainPublisherService.publishDomainEvent`
   (ProductionEvent, StepExecution, MashingExecution, ScheduleOrder,
   BatchDeviation, ProductionOrder today) also calls
   `ForgeIngestService.enqueueDomainEvent`, regardless of MQTT publish rules.
   The mapper turns the `DomainEventParams` into a `ContextualRecord`.
4. **Batching.** Records are queued (bounded, `FORGE_INGEST_MAX_QUEUE`, oldest
   dropped) and flushed as one `Ingest` stream per batch, either when
   `FORGE_INGEST_BATCH_SIZE` is reached or every
   `FORGE_INGEST_FLUSH_INTERVAL_MS`. In-flight records leave the queue at send
   time.
5. **Failures.** A failed batch is retried with exponential backoff
   (5 retries, 1 s → 30 s). Five consecutive failures open a circuit for
   45 s; two successes in half-open close it. A batch that exhausts its
   retries is **dead-lettered**: counted, logged, dropped (sink: FB-056).
6. **Shutdown.** `onModuleDestroy` drains the queue, calls `Stop(graceful)`
   and closes the channel.
7. **Observability.** `GET /api/forge/status` (authenticated) returns the
   session state, last hub health, queue depth, circuit state and counters.

## Record mapping

Proto `RecordContext` has fixed fields plus an `extra` map. The FACTS fields
that have no fixed slot travel in `extra`, exactly as the Python adapter
serialises them.

| FACTS field | Source in the domain event | Proto location |
|---|---|---|
| batch_id | `context.batchId` → `data.batchId` → `data.batch.id` | `context.batch_id` |
| recipe_id | `data.recipeId` → `data.recipe.id` | `context.recipe_id` |
| equipment_id | `context.assetId` → `data.assetId`/`equipmentId` → `data.equipmentPhase.equipment.id` | `context.equipment_id` |
| lot_id | `data.lotId` → `data.lot.id` | `context.lot_id` |
| operator_id | `data.initiatedBy` → `operatorId` → `userId` → `createdBy` | `context.operator_id` |
| shift_id | derived from event time, Louisville day 06:00–18:00 / night | `context.shift` |
| production_order_id, work_order_id | `data.productionOrderId` → `data.productionOrder.id` | `context.extra` |
| schedule_order_id | `context.scheduleOrderId` → `data.scheduleOrderId` | `context.extra` |
| event_type | `entityType`/`eventType` normalised (`step_started` → `step.started`) | `context.extra.event_type` |
| event_timestamp | `data.eventTimestamp` → `timestamp` → `updatedAt` → `createdAt` → now | `timestamp.source_time` and `context.extra` |
| equipment_phase, process_step | `context.phase`/`data.phase`; `data.stepName`/`operationName` | `context.extra` |
| quality_result_id, material_id, whiskey_type | `data.testId`; `data.itemId`; `data.recipe.whiskeyType.name` | `context.extra` |
| site, area | `FORGE_SITE`, `context.area` → `FORGE_AREA` | `context.site`, `context.area` |
| payload | the whole `data` object, JSON-encoded | `value.json_value` (`data_type: object`) |
| quality | GOOD when an id and a time exist, UNCERTAIN for one, NOT_AVAILABLE for none, BAD on `error` | `value.quality` |
| tag path | `mes.backend.<entitytype>` | `source.tag_path` |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FORGE_HUB_ENABLED` | `false` | Master switch. Nothing is dialled when false. |
| `FORGE_HUB_GRPC_URL` | `localhost:50051` | Hub gRPC address (`FORGE_GRPC_PORT` on the hub). |
| `FORGE_HUB_TLS_ENABLED` / `_CA` / `_CERT` / `_KEY` | off | PEM paths for a TLS/mTLS channel. |
| `FORGE_ADAPTER_ID` | `forge-mes` | Adapter identity (override per environment, e.g. `forge-mes-staging`). |
| `FORGE_SITE` / `FORGE_AREA` | `whk01` / `distillery01` | Default ISA-95 context (matches the UNS `wh.whk01.distillery01.*`). |
| `FORGE_INGEST_BATCH_SIZE` | `100` | Records per Ingest stream. |
| `FORGE_INGEST_FLUSH_INTERVAL_MS` | `1000` | Timer flush. |
| `FORGE_INGEST_MAX_QUEUE` | `10000` | Bounded queue while the hub is unreachable. |
| `FORGE_HEALTH_INTERVAL_MS` | `15000` | Heartbeat cadence. |
| `FORGE_RPC_TIMEOUT_MS` | `10000` | Deadline per RPC / per Ingest stream. |
| `FORGE_SELF_GRAPHQL_URL` | `http://localhost:<PORT>/graphql` | Advertised to the hub in `Configure` (`graphql_url`). |

Retry, circuit-breaker and degradation thresholds are constants taken from
the FACTS spec (`error_handling`) and are not environment-tunable on purpose.

## Running against a local hub

```bash
# hub (repo root): REST on 8000, gRPC on 50051
FORGE_GRPC_ENABLED=true FORGE_GRPC_PORT=50051 uvicorn forge.api.main:app --port 8000

# backend (modules/Forge MES/backend)
FORGE_HUB_ENABLED=true FORGE_HUB_GRPC_URL=localhost:50051 npm run start
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/forge/status
```

The hub's gRPC server runs `HubIngestServicer` (FB-053): `Register` is checked
against the adapter's FACTS spec, and streamed records are validated, routed and
written to `forge_ts.contextual_records` (or an in-memory sink when no database
is configured). `GET /v1/ingest/stats` on the hub shows per-session counters.

## Tests

`backend/src/forge/__tests__/`

* `contextual-record.mapper.spec.ts` — field mapping, event-type table, shift rule, quality.
* `forge-ingest.service.spec.ts` — batching, bounded queue, retry/backoff, circuit, dead-letter, concurrency.
* `forge-hub.client.spec.ts` — a real gRPC round trip against an in-process `AdapterService` built from the vendored protos (Register → Configure → Start → Ingest → Health → Stop).
* `forge-parity.spec.ts` — proto and manifest parity with the hub tree (skipped outside the monorepo).

## Persistence plan: `mod_mes`

Today the backend owns its own PostgreSQL database through Prisma
(`backend/prisma/schema.prisma`, 84 models). `docs/DB_ORCHESTRATION_FRAMEWORK.md`
(repo root) reserves the `mod_mes` schema for it and `migration 002_spoke_schemas`
already creates the schema; `storage/access.py` grants `forge-mes` read/write on it.

Target state and the steps to get there (FB-057):

1. **Connection string from Forge.** `forge db access grant forge-mes mod_mes rw`
   issues credentials scoped to `mod_mes.*` plus `SELECT` on `forge_canonical.*`.
   The backend receives it as `DATABASE_URL` with `?schema=mod_mes`; no query
   code changes.
2. **Baseline the schema.** `prisma migrate diff` from the current database to
   an empty `mod_mes` produces the baseline migration; apply it through the
   hub's migration runner (`forge migrate up`) so the hub owns DDL ordering.
3. **Canonical mirror.** Records streamed through `Ingest` are persisted by the
   hub into `forge_canonical` (FB-053). `mod_mes` stays the system of record for
   MES entities; the canonical store is what other spokes and the OT module read.
4. **Cross-module reads** go through the hub's query federation, never
   directly to `mod_wms` / `mod_cmms`.
5. **Cut-over.** Run the backend against the Forge pod in staging, compare
   row counts and the GraphQL conformance suite, then retire the module-local
   database.

Risks to track: Prisma multi-schema support and `search_path`, row-level
security on shared tables, and the 2026 Q4 timing in the framework roadmap.

## Follow-ups

| Item | Backlog |
|---|---|
| Hub persists ingested records (replace `InMemoryServicer`) | FB-053 (done) |
| Durable adapter registry and ingest audit log on the hub | FB-060 |
| Hub → spoke write-back (`Write`, OT `recipe/next` → changeover) | FB-054 |
| Cross-language contract test in CI (Python hub ↔ TS client) | FB-055 |
| Dead-letter sink for exhausted batches | FB-056 |
| `mod_mes` persistence cut-over | FB-057 |
