# forge-core integration (backend)

The Forge MES backend is a **spoke** of the forge-core **hub**. This document
describes the backend side of that link (BACKLOG FB-034, FB-054): how the
backend registers with the hub, how domain events become `ContextualRecord`s,
how the hub writes back into the MES, how failures are handled, and how
`mod_mes` persistence is planned.

Code: `backend/src/forge/`. Hub counterpart: `src/forge/transport/` and
`src/forge/adapters/forge_mes/` in the forge repository root.

## Topology

```
MES backend (NestJS)                                forge-core hub (Python)
┌───────────────────────────────┐   gRPC forge.v1.AdapterService   ┌─────────────────────────┐
│ domain services               │ ──Register/Configure/Start────▶ │ GrpcServer (:50051)     │
│   └─ MqttDomainPublisherService│ ──Ingest(stream ContextualRecord)▶│   └─ HubIngestServicer    │
│        └─ ForgeIngestService   │ ──Health (heartbeat)───────────▶ │        └─ IngestPipeline  │
│ ForgeHubService (session)      │ ──Stop(graceful) on shutdown───▶ │                          │
│                               │                                   │ WriteDispatcher          │
│ ForgeSpokeServer (:50052)      │ ◀──Write / Discover / Health──── │   ◀─ REST, OT module     │
│   └─ ForgeWriteService         │        (grpc_callback_url)        │                          │
│        └─ ChangeoverForgeWriteTarget                                └─────────────────────────┘
└───────────────────────────────┘
```

* **Push model.** The backend dials the hub and streams records. The hub's
  gRPC server implements the spoke-to-hub half of `AdapterService`
  (`Register`, `Configure`, `Start`, `Stop`, `Health`, `Ingest`).
* **Write-back.** The backend also hosts the spoke half (`Write`, `Discover`,
  `Health`) on its own port and tells the hub where in `Configure`
  (`grpc_callback_url`); see [Write-back](#write-back-hub--spoke). The pull
  RPCs (`Collect`, `Subscribe`, `Unsubscribe`, `Backfill`) are not served
  (FB-061).
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
| Callback address | `grpc_callback_url` Configure param | `host:port` of `ForgeSpokeServer`; the hub's `WriteDispatcher` dials it for `Write`/`Discover`/`Health`. Listed in the manifest as an optional, non-secret connection param. |
| Schema ref | `forge://schemas/forge-mes/v0.1.0` | `lineage.schema_ref` on every record. |

## Flow

1. **Startup.** `ForgeSpokeServer.onModuleInit` binds the spoke gRPC port;
   `ForgeHubService.onApplicationBootstrap` (after every module has
   registered its write targets) runs the handshake in the background with
   exponential backoff (1 s → 30 s) until the hub answers:
   `Register(manifest)` → session id → `Configure(connection params +
   grpc_callback_url)` → `Start` → state `healthy`. The hub-issued session id
   becomes the credential inbound write-back calls must present.
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
   session state, last hub health, queue depth, circuit state, write-back
   server state and counters; `GET /api/forge/tags` lists the writable tags.

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

## Write-back (hub → spoke)

BACKLOG FB-054. Direction chosen: the backend **hosts the spoke half of
`AdapterService`** rather than consuming hub commands from RabbitMQ, because
`Write` is synchronous, carries a read-back (`confirm`) and reuses the
contract, session and TLS material the ingest path already has. The hub
learns the address from `grpc_callback_url` on `Configure`.

```
OT module / operator / REST                hub                               MES backend
MesChangeoverClient.cip_complete() ─▶ WriteDispatcher.write("forge-mes",    ForgeSpokeServer.Write
POST /v1/adapters/forge-mes/write        "mes.changeover.cooker.cip-complete", ─▶ session check
                                         {...}, confirm=True)                 ─▶ ForgeWriteService → ChangeoverForgeWriteTarget
                                              ◀── WriteResponse{success, message,   ─▶ ChangeoverService.cipComplete()
                                                   readback: mes.changeover.cooker.state}   (publishes recipe/next on MQTT)
```

### Writable tags

`ForgeWriteService` is a registry: a domain module registers a
`ForgeWriteTarget` for a tag prefix and the server routes by longest prefix.
The changeover module owns `mes.changeover` (both `.` and `/` separators are
accepted):

| Tag | Payload (same DTO as the REST endpoint) | Accepted states | Effect |
|---|---|---|---|
| `mes.changeover.<area>.request` | `ChangeoverRequestDto` `{requestedBy, force?, reason?, notes?}` | PRODUCTION, COOK_COMPLETE | → AWAITING_CHANGEOVER |
| `mes.changeover.<area>.cip-complete` | `CipCompleteDto` `{cipStartTime, cipEndTime, cipDurationSeconds?, reportedBy?}` | CIP_IN_PROGRESS, AWAITING_CHANGEOVER | → CIP_COMPLETE → RECIPE_LOADING; publishes `recipe/next` |
| `mes.changeover.<area>.recipe-loaded` | `RecipeLoadedDto` `{scheduleOrderRecipeInstanceId, sourceUpdatedAt, cookerNumber, loadedBy?}` | RECIPE_LOADING, CIP_COMPLETE | → RECIPE_LOADED → READY_TO_START (409-style `conflict` on a stale `sourceUpdatedAt`) |
| `mes.changeover.<area>.start-production` | `StartProductionDto` `{startedBy, notes?}` | READY_TO_START | → PRODUCTION; advances the queue |
| `mes.changeover.<area>.reset` | `ResetErrorDto` `{targetState, resetBy, reason?}` | ERROR | → AWAITING_CHANGEOVER or CIP_COMPLETE |
| `mes.changeover.<area>.state` | read-only | | returned as the read-back of a confirmed command |

`<area>` is `cooker`, `fermentation` or `barreling`. The value travels as
`json_value`; payloads are validated with the same class-validator DTOs
(unknown fields are refused). A refusal (`invalid_tag`, `invalid_payload`,
`invalid_state`, `conflict`, `not_found`) comes back as `success=false` with
the reason in `message`, never as a gRPC error, so the hub can tell "the MES
said no" from "the MES is down". With `confirm=true` the response carries a
`ContextualRecord` on `mes.changeover.<area>.state` whose `json_value` is the
area state plus the `transition` result (`event_type` = `changeover.<command>`).

`Discover` (and `GET /api/forge/tags`) lists every tag with its payload DTO,
accepted states and REST equivalent, so the OT module can introspect them.

### Authorisation

Every inbound call must carry `adapter_id` = this backend's `FORGE_ADAPTER_ID`
and `session_id` = the session the hub issued on `Register`; anything else is
`PERMISSION_DENIED` and counted in `deniedCalls`. The session id is only ever
exchanged over the hub link, so it acts as the bearer for callbacks; in
production put both directions behind TLS (`FORGE_HUB_TLS_*` also serves the
spoke port, and a CA makes it mTLS). Hardening beyond that is FB-063.

### Hub side

| Hub API | Purpose |
|---|---|
| `POST /v1/adapters/forge-mes/write` `{tag_path, value, confirm?}` | Dispatch one write; 404 unknown adapter, 409 no callback advertised, 403 adapter registered without `capabilities.write`, 502 spoke unreachable or RPC error. |
| `GET /v1/adapters/forge-mes/tags` | The spoke's `Discover`. |
| `GET /v1/writes` | Callback per adapter with write/success/failure counters and the last outcome. |

In Python, `forge.transport.spoke_callback.WriteDispatcher` is the entry
point (`app.state.write_dispatcher`); the OT module gets a typed wrapper,
`forge.modules.ot.control.MesChangeoverClient` (`request`, `cip_complete`,
`recipe_loaded`, `start_production`, `reset`), and the hub-side
`ForgeMesAdapter.write()` routes through the same dispatcher once
`attach_write_dispatcher()` is called.

```bash
curl -X POST http://localhost:8000/v1/adapters/forge-mes/write \
  -H 'content-type: application/json' \
  -d '{"tag_path":"mes.changeover.cooker.cip-complete",
       "value":{"cipStartTime":"2026-06-01T08:00:00Z","cipEndTime":"2026-06-01T09:00:00Z","reportedBy":"ot"},
       "confirm":true}'
```

### OT module orchestration

BACKLOG FB-062. `forge.modules.ot.control.ChangeoverOrchestrator` closes the
loop: it subscribes to the two MES topics and answers through the write-back
path, so the sequence Ignition used to complete over REST now runs inside
Forge.

| MES publishes (retained) | Orchestrator does | MES write |
|---|---|---|
| `changeover/state` = AWAITING_CHANGEOVER | per `CipPolicy`: `EXTERNAL` wait, `RUNNER` run the `CipRunner`, `SKIP` report at once | `cip-complete` with the CIP times |
| `recipe/next` (+ state CIP_COMPLETE / RECIPE_LOADING) | `RecipeWriteAdapter.execute_recipe_write` with `recipeParameters` mapped to PLC tags; only when **every** parameter reads back CONFIRMED | `recipe-loaded` with `scheduleOrderRecipeInstanceId`, `sourceUpdatedAt`, `cookerNumber` |
| `changeover/state` = READY_TO_START | `confirm_start(area, operator)` or `auto_start` | `start-production` |
| `changeover/state` = PRODUCTION | clears the pending/loaded recipe | |

Rules: a recipe is loaded only when its `scheduleOrderId` is the area's
`nextSOId` (a recipe that arrives before the state echo is parked); retained
messages only synchronise state unless `act_on_retained=True`, and
`resume(area)` acts on the current state after a restart; a partial recipe
download leaves the MES in RECIPE_LOADING for `retry_recipe(area)`; every MES
write attempt (delivered, refused or undeliverable) becomes a
`ContextualRecord` on `ot.changeover.<area>.<command>` handed to the
`record_sink` for the audit trail (FB-060).

Running it (BACKLOG FB-065). The OT module is hosted in the hub process:
set `FORGE_OT_CONTROL_CONFIG` to an `OTControlConfig` JSON document
(example: `deploy/ot/ot-control.example.json`) and, optionally,
`FORGE_OT_TAGS_DIR` to a directory of `*.tags.json` definitions. The hub then
builds `OTModuleHost` → `OTModuleAdapter(control=ControlDependencies(...))` →
`ControlRuntime`, which composes from the one document:

| Section | Becomes |
|---|---|
| `write_tags` | `WriteValidator` (type/range per PLC tag) |
| `interlocks`, `permissions` | `InterlockEngine`, `WriteAuthorizer` |
| `recipes` | `RecipeWriteAdapter` with per-equipment parameter → tag mappings |
| `changeover_areas[].cip` | `PlcCipRunner`: start tag written through the write engine, state tag polled until Complete/Faulted, `equipment/cipState` published (retained) |
| `changeover_areas` | `ChangeoverOrchestrator` + `MesChangeoverClient(app.state.write_dispatcher)` |
| `mqtt.mode` | `local` (embedded Forge broker, replays retained state on start), `external` (aiomqtt with reconnect) or `none` |
| `connections` | `PlcConnectionManager` (FB-069): one `OpcUaClient` + `OpcUaProvider` per PLC on the host's `AcquisitionEngine`, supervised restarts with back-off, `GET/POST /api/v1/ot/control/connections[/{name}/restart]` |

Cross-references are checked at start-up (a recipe mapping or CIP start tag
that is not in `write_tags`, an area whose equipment has no recipe entry).
Every control write result is journaled, logged, published on
`<root>/<site>/<area>/ot/control/audit/<request_id>` and stored in the hub
ingest pipeline as a ContextualRecord on `ot.control.write.<tag>` (FB-066);
every MES write attempt becomes a ContextualRecord on
`ot.changeover.<area>.<command>`. In `mqtt.mode = external` the runtime owns
an aiomqtt publisher for cipState and audit (FB-067); PLC sessions are
probed with a server-clock read every `liveness_interval_seconds` (FB-070).

REST (`/api/v1/ot`): `GET control/status`, `GET control/tags`,
`GET control/writes?tag_path=&status=&area=&since=`, `GET changeover`,
`GET changeover/{area}`, `GET changeover/{area}/events`,
`POST changeover/{area}/confirm-start {operator_id}`,
`POST changeover/{area}/retry-recipe`, `POST changeover/{area}/resume`
(409 when the area's MES state does not allow the action, 404 unknown area,
503 before the runtime exists). `GET /v1/info` reports the hosted module.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FORGE_HUB_ENABLED` | `false` | Master switch. Nothing is dialled when false. |
| `FORGE_HUB_GRPC_URL` | `localhost:50051` | Hub gRPC address (`FORGE_GRPC_PORT` on the hub). |
| `FORGE_HUB_TLS_ENABLED` / `_CA` / `_CERT` / `_KEY` | off | PEM paths for a TLS/mTLS channel. The same material serves the spoke port: with TLS on, `_CERT` and `_KEY` are required for the server and a `_CA` makes it require a client certificate from the hub. |
| `FORGE_SPOKE_GRPC_ENABLED` | `true` | Host the spoke half of `AdapterService` for hub write-back (only when `FORGE_HUB_ENABLED` is true). |
| `FORGE_SPOKE_GRPC_BIND` | `0.0.0.0:50052` | Bind address of the spoke gRPC server. |
| `FORGE_SPOKE_GRPC_ADVERTISE_URL` | bind host (`localhost` for wildcards) + bound port | What the hub dials; set it to the service name in Compose/Kubernetes, e.g. `mes-backend:50052`. |
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

# backend (modules/Forge MES/backend): spoke server on 50052, advertised as localhost:50052
FORGE_HUB_ENABLED=true FORGE_HUB_GRPC_URL=localhost:50051 npm run start
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/forge/status

# write-back through the hub (see Write-back above)
curl http://localhost:8000/v1/adapters/forge-mes/tags
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
* `forge-write.service.spec.ts` — write-target registry: prefix routing, refusals vs failures, stats.
* `forge-spoke.server.spec.ts` — the spoke-hosted `AdapterService` over a real socket: session checks, typed values, read-back, `Discover`, `Health`, `UNIMPLEMENTED` for the pull RPCs, TLS/bind failures.
* `forge-hub.service.spec.ts` — handshake carries `grpc_callback_url` and hands the session id to the spoke server.
* `../changeover/__tests__/changeover.forge-write.spec.ts` — tag parsing, DTO validation, command → service mapping, exception → reject codes, read-back record.

Hub side: `tests/transport/test_spoke_callback.py` (dispatcher, servicer wiring,
live gRPC against a spoke stub), `tests/api/test_write_api.py`,
`tests/modules/ot/control/test_mes_changeover.py`,
`tests/modules/ot/control/test_changeover_orchestrator.py` (full sequence
against a fake MES, CIP policies, retained replay, partial downloads, outages).

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
| Hub → spoke write-back (`Write`/`Discover`/`Health` served by the backend; changeover commands as tags) | FB-054 (done) |
| Pull RPCs (`Collect`, `Subscribe`, `Unsubscribe`, `Backfill`) on the spoke | FB-061 |
| OT module drives the changeover sequence (`ChangeoverOrchestrator`) | FB-062 (done) |
| CIP runner + OT composition root (orchestrator wired into the OT adapter lifecycle) | FB-065 (done) |
| PLC connections for the hosted OT module (OPC-UA providers behind `RegistryTagIO`) | FB-069 (done) |
| Liveness probe for silent PLC link loss | FB-070 (done) |
| Control write audit records into the hub store | FB-066 (done) |
| Callback authorisation beyond the session id (per-spoke token / mTLS required in prod) | FB-063 |
| Cross-language contract test in CI (Python hub ↔ TS client) | FB-055 |
| Dead-letter sink for exhausted batches | FB-056 |
| `mod_mes` persistence cut-over | FB-057 |
