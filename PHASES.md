# Forge Platform — Phased Development Plan

**Version:** 0.1 — April 2026
**Branch Convention:** `forge_dev<01-09>` (mirrors MDEMG pattern)
**Governance:** FxTS spec-first — every phase produces specs before implementation

---

## Phase Numbering Convention

| Series | Range | Domain |
|--------|-------|--------|
| **F0x** | F01–F09 | Foundation & Core Infrastructure |
| **F1x** | F10–F19 | Governance Framework (FxTS) |
| **F2x** | F20–F29 | Storage & Context Engine |
| **F3x** | F30–F39 | Adapter Framework & First Integrations |
| **F4x** | F40–F49 | Curation & Data Products |
| **F5x** | F50–F59 | Serving Layer & APIs |
| **F6x** | F60–F69 | Decision Support & Structured Challenge |
| **F7x** | F70–F79 | Observability & Operations |
| **F8x** | F80–F89 | Security, Compliance & Hardening |
| **F9x** | F90–F99 | Production Readiness & Deployment |
| **FWx** | FW01–FW09 | WHK-Specific Integration (whk-wms, whk-mes) |

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| 🔒 | Blocked (dependency not met) |
| 🚪 | Gate (must pass before next phase) |

---

## Foundation & Core Infrastructure (F0x)

### F01: Project Scaffold & Tooling
**Effort:** Small | **Dependencies:** None | **Gate:** F01-GATE

Establish the monorepo structure, tooling, and development workflow.

**Deliverables:**
- [ ] Monorepo structure with workspace layout (Python core + TS/JS modules)
- [ ] Python workspace: `pyproject.toml` with UV, Ruff config, pytest
- [ ] TypeScript workspace: `package.json` with pnpm, ESLint, Prettier, Jest
- [ ] Shared configuration: `.editorconfig`, `.gitignore`, CI workflow stubs
- [ ] `forge` CLI skeleton (Typer): `forge init`, `forge version`, `forge health`
- [ ] Docker Compose template (empty services, port allocation pattern from MDEMG)
- [ ] CONTRIBUTING.md, LICENSE placeholder

**Gate F01-GATE:** Project builds, lints clean (Ruff + ESLint), CLI prints version.

---

### F02: Core Data Models & Schemas
**Effort:** Medium | **Dependencies:** F01 | **Gate:** F02-GATE

Define the foundational data types that flow through the entire platform.

**Deliverables:**
- [x] `ContextualRecord` schema (JSON Schema draft 2020-12) — the fundamental data unit
- [x] `AdapterManifest` schema — adapter capability declaration
- [x] `DataProduct` schema — curated dataset descriptor
- [x] `LineageRecord` schema — provenance chain element
- [x] `DecisionFrame` schema — structured challenge workflow (13-point BBD frame)
- [x] Python Pydantic models for all schemas
- [x] Manufacturing domain models: 10 entity families (ManufacturingUnit, Lot, PhysicalAsset, OperationalEvent, BusinessEntity, ProcessDefinition, WorkOrder, MaterialItem, QualitySample, ProductionOrder) — Path 2 complete
- [x] Context field registry: 12 canonical fields with WMS + MES provenance
- [x] JSON Schemas generated for all 10 manufacturing entity families
- [x] 91 core model tests + 244 FACTS governance tests = 335 total passing
- [ ] TypeScript Zod models for all schemas (shared between NestJS/NextJS) — deferred to Path 3
- [ ] Schema validation utilities (Python + TypeScript) — partially complete (Python done)

**Gate F02-GATE:** All schemas validate against JSON Schema meta-schema. Pydantic and Zod models serialize/deserialize correctly. Round-trip tests pass.

---

### F03: Message Broker Setup
**Effort:** Small | **Dependencies:** F01 | **Gate:** F03-GATE

Stand up Kafka with foundational topics and schema registry.

**Deliverables:**
- [ ] Kafka service in Docker Compose (KRaft mode, no ZooKeeper)
- [ ] Confluent Schema Registry service in Docker Compose
- [ ] Foundational topics: `forge.ingestion.raw`, `forge.ingestion.contextual`, `forge.governance.events`, `forge.curation.products`
- [ ] Topic configuration: retention, partitioning, replication strategy
- [ ] Python Kafka producer/consumer base classes
- [ ] TypeScript Kafka producer/consumer base classes (KafkaJS)
- [ ] Health check integration in `forge health`

**Gate F03-GATE:** Produce and consume messages on all foundational topics. Schema Registry registers and validates a test schema.

---

### F04: Storage Engine Provisioning
**Effort:** Medium | **Dependencies:** F01 | **Gate:** F04-GATE

Stand up all storage engines with schema migrations and connection management.

**Deliverables:**
- [ ] PostgreSQL service in Docker Compose (master data, governance state)
- [ ] TimescaleDB service in Docker Compose (time-series)
- [ ] Neo4j service in Docker Compose (graph: equipment topology, genealogy)
- [ ] Redis service in Docker Compose (cache, real-time state)
- [ ] MinIO service in Docker Compose (object storage)
- [ ] PostgreSQL migration framework (Alembic)
- [ ] TimescaleDB migration framework (Alembic, hypertable creation)
- [ ] Neo4j migration framework (numbered Cypher scripts, adapted from MDEMG)
- [ ] Connection pool management for all engines
- [ ] Health checks for all engines in `forge health`
- [ ] `forge init` command: port allocation, `.env` generation, service startup

**Gate F04-GATE:** All 5 storage engines start, pass health checks, accept test writes/reads. `forge init` generates working `.env` and starts stack.

---

### F05: API Gateway Foundation
**Effort:** Medium | **Dependencies:** F02, F04 | **Gate:** F05-GATE

Stand up the API gateway with auth, routing, and request validation.

**Deliverables:**
- [ ] `forge-gateway` FastAPI service with OpenAPI 3.1
- [ ] Authentication middleware (JWT + API key, configurable)
- [ ] Authorization middleware (RBAC, scope-based)
- [ ] Rate limiting (Redis-backed)
- [ ] Request validation against registered schemas
- [ ] Standard error response format
- [ ] Health endpoint (`GET /healthz`), readiness endpoint (`GET /readyz`)
- [ ] FATS specs for all gateway endpoints (spec-first — written BEFORE implementation)
- [ ] FATS runner (adapted from UATS runner pattern)
- [ ] Docker Compose integration

**Gate F05-GATE:** 🚪 All FATS specs pass. Gateway authenticates, authorizes, rate-limits, and routes requests. OpenAPI spec generated and validated.

---

## Governance Framework — FxTS (F1x)

### F10: FxTS Core Infrastructure
**Effort:** Medium | **Dependencies:** F01 | **Gate:** F10-GATE

Build the shared FxTS runner infrastructure and the framework governance policy.

**Deliverables:**
- [ ] `fxts_runner_core.py` — shared base: CLI, SHA256, status computation, canonical report format
- [ ] `fxts_report.py` — canonical JSON report builder
- [ ] `fxts_schemas.py` — common schema types and validators
- [ ] `FRAMEWORK_GOVERNANCE.md` — FxTS governance policy (adapted from UxTS)
- [ ] Framework directory layout template (schema/ specs/ runners/ fixtures/)
- [ ] `forge governance` CLI subcommand: `validate`, `validate-all`, `add-hashes`, `verify-hashes`, `status`
- [ ] CI workflow template for FxTS spec enforcement

**Gate F10-GATE:** Shared infrastructure validates a sample spec. CLI commands work. Governance policy reviewed and approved.

---

### F11: FATS — Forge API Test Specification
**Effort:** Medium | **Dependencies:** F10, F05 | **Gate:** F11-GATE

The primary API governance framework. Specs define what endpoints must exist.

**Deliverables:**
- [ ] `fats.schema.json` (JSON Schema draft 2020-12)
- [ ] `fats_runner.py` with full schema-runner parity
- [ ] FATS specs for all F05 gateway endpoints
- [ ] Variant support (multiple test cases per spec)
- [ ] Environment variable resolution (`${FORGE_BASE_URL}`)
- [ ] JSONPath body assertions
- [ ] CI gate (hard-fail, merge-blocking)
- [ ] Makefile targets: `make test-api`, `make test-api-{spec}`

**Gate F11-GATE:** 🚪 All FATS specs pass against live gateway. Runner reports 100% schema-runner parity. CI gate blocks PR with failing spec. Zero 0/0 false passes.

---

### F12: FACTS — Forge Adapter Conformance Test Specification
**Effort:** Medium | **Dependencies:** F10 | **Gate:** F12-GATE

Governs adapter behavior. Specs define what adapters must do.

**Deliverables:**
- [x] `facts.schema.json` — JSON Schema draft 2020-12, 10 top-level properties, 60 schema tests
- [x] `facts_runner.py` — FACTSRunner with 10 enforced fields, all static checks, cross-field consistency, FHTS governance (72 tests)
- [x] Data contract tests (output schema, context fields, data source validation, sample record coverage)
- [x] WHK adapter specs: `whk-wms.facts.json` (48 tests), `whk-mes.facts.json` (64 tests) — serve as example specs
- [ ] CI gate (hard-fail for production adapters) — gate infrastructure exists, CLI integration deferred
- [ ] Live adapter lifecycle tests (connect, health, shutdown) — deferred to Path 3 (requires adapter code)

**Status:** 244/244 tests passing. Schema-runner parity verified. Both specs hash-verified and assertion-clean.

**Gate F12-GATE:** 🚪 Runner validates adapter lifecycle and data contract. Schema-runner parity verified.
**Gate Status:** Partially met — static validation complete (0 failures on both specs), live checks deferred.

---

### F13: FQTS — Forge Quality Test Specification
**Effort:** Medium | **Dependencies:** F10, F04 | **Gate:** F13-GATE

Governs data quality. Specs define quality contracts for data products.

**Deliverables:**
- [ ] `fqts.schema.json` — categories: completeness, accuracy, freshness, consistency, context
- [ ] `fqts_runner.py` — evaluates quality rules against live data
- [ ] Quality rule types: frequency checks, null rates, range validation, freshness SLOs
- [ ] Context field presence validation
- [ ] Continuous evaluation mode (schedule-driven)
- [ ] CI gate (hard-fail for production data products)

**Gate F13-GATE:** Runner evaluates quality rules against sample data. Reports completeness, accuracy, freshness scores.

---

### F14: FSTS — Forge Security Test Specification
**Effort:** Small | **Dependencies:** F10, F05 | **Gate:** F14-GATE

Governs security controls. Specs define what security behavior must exist.

**Deliverables:**
- [ ] `fsts.schema.json` — categories: authentication, authorization, injection, data_exposure, headers
- [ ] `fsts_runner.py` — injection tests, auth bypass tests, header validation
- [ ] OWASP mapping (A01-A10 references)
- [ ] CI gate (hard-fail)

**Gate F14-GATE:** Runner catches injection attempts, validates auth enforcement, checks security headers.

---

### F15: FLTS, FNTS, FOTS, FPTS — Remaining Frameworks
**Effort:** Medium | **Dependencies:** F10 | **Gate:** F15-GATE

Build out remaining governance frameworks.

**Deliverables:**
- [ ] **FLTS** (Lineage): schema + runner + specs for lineage chain integrity
- [ ] **FNTS** (Normalization): schema + runner + specs for unit/definition consistency
- [ ] **FOTS** (Observability): schema + runner + specs for pipeline health, freshness, SLOs
- [ ] **FPTS** (Performance): schema + runner + profiles (smoke, load, stress)

**Gate F15-GATE:** All four runners pass schema-runner parity checks. Sample specs validate successfully.

---

## Storage & Context Engine (F2x)

### F20: Schema Registry Service
**Effort:** Medium | **Dependencies:** F04, F05 | **Gate:** F20-GATE

**Deliverables:**
- [ ] `forge-registry` FastAPI service
- [ ] Schema CRUD endpoints (register, get, list, versions, check compatibility)
- [ ] Compatibility modes: BACKWARD, FORWARD, FULL, NONE
- [ ] Schema types: adapter_output, data_product, api, event, governance
- [ ] Version history with diff capability
- [ ] FATS specs for all registry endpoints (spec-first)
- [ ] PostgreSQL storage for schema state

**Gate F20-GATE:** 🚪 All FATS specs pass. Schemas register, version, and compatibility-check correctly.

---

### F21: Context Engine Service
**Effort:** Large | **Dependencies:** F04, F05, F20 | **Gate:** F21-GATE

The service that ensures every data record carries its operational context.

**Deliverables:**
- [ ] `forge-context` FastAPI service
- [ ] Context enrichment pipeline: validate required fields → cross-reference master data → attach missing context
- [ ] Equipment registry (PostgreSQL) — equipment identity, hierarchy, attributes
- [ ] Batch/lot tracker — active production runs, material associations
- [ ] Shift/crew resolver — current shift from schedule data
- [ ] Operating mode detector — infer mode from process signals
- [ ] Context attachment API (called by adapters or ingestion pipeline)
- [ ] Query-time context enrichment (retrospective context for historical data)
- [ ] FATS specs for all context endpoints
- [ ] FQTS specs for context completeness requirements

**Gate F21-GATE:** 🚪 Context engine enriches a raw record with equipment, batch, shift, and mode context. FATS and FQTS specs pass.

---

### F22: Storage Orchestrator Service
**Effort:** Medium | **Dependencies:** F04, F20 | **Gate:** F22-GATE

Routes data to appropriate storage engines based on schema and data type.

**Deliverables:**
- [ ] `forge-storage` FastAPI service
- [ ] Routing rules: time-series → TimescaleDB, master data → PostgreSQL, graph data → Neo4j, blobs → MinIO
- [ ] Write path: validate schema → route → write → confirm → emit event
- [ ] Read path: determine engine(s) → query → assemble → return
- [ ] Cross-engine query coordination (simple joins across engines)
- [ ] FATS specs for all storage endpoints
- [ ] FPTS specs for write/read latency benchmarks

**Gate F22-GATE:** 🚪 Records route to correct engines based on type. Cross-engine read assembles data from multiple sources.

---

## Adapter Framework & First Integrations (F3x)

### F30: Adapter Framework Core
**Effort:** Medium | **Dependencies:** F02, F03, F12 | **Gate:** F30-GATE

The plugin framework for system integrations.

**Deliverables:**
- [x] Adapter interface definition (Python abstract base classes) — `AdapterBase` + 4 capability mixins (Path 3)
- [x] Adapter manifest loader and validator — `AdapterManifest` Pydantic model + JSON loader (Path 3)
- [x] Adapter lifecycle manager (register → connect → healthy → degraded → failed → stopped) — state machine in `AdapterBase` (Path 3)
- [ ] Adapter health monitoring with circuit breaker
- [ ] Auto-restart with exponential backoff
- [ ] Adapter registry (discover and list available adapters)
- [ ] `forge adapter` CLI subcommand: `list`, `status`, `start`, `stop`, `logs`, `test`
- [ ] FACTS specs for the framework's own behavior

**Gate F30-GATE:** 🚪 Framework loads adapter from manifest, manages lifecycle, reports health. FACTS runner validates conformance.

---

### F31: Example Adapters (Reference Implementations)
**Effort:** Medium | **Dependencies:** F30 | **Gate:** F31-GATE

Reference adapters that demonstrate the pattern and serve as templates.

**Deliverables:**
- [ ] **OPC UA adapter** (stub/simulator) — demonstrates OT tier collection
- [ ] **MQTT Sparkplug B adapter** (stub/simulator) — demonstrates pub/sub OT collection
- [ ] **REST API adapter** (generic) — demonstrates MES/ERP tier collection
- [ ] **CSV/file adapter** — demonstrates document tier collection
- [ ] Each adapter: manifest, FACTS spec, unit tests, documentation
- [ ] Adapter developer guide: "How to build a Forge adapter"

**Gate F31-GATE:** All four adapters pass FACTS conformance specs. Developer guide reviewed.

---

### F32: WHK WMS Adapter
**Effort:** Medium | **Dependencies:** F30, F31 | **Gate:** F32-GATE

First production adapter — connects Forge to `whk-wms` (507K LOC TypeScript).

**Deliverables:**
- [x] Adapter for `whk-wms` REST/GraphQL APIs — `WhkWmsAdapter` class with full lifecycle, 9 mapper functions, context builder, record builder (Path 3, 462 tests)
- [x] Data sources: inventory movements, warehouse operations, product tracking — 6 data sources in `discover()`, 9 entity mappers covering barrels, lots, locations, events, customers, vendors, jobs, production orders
- [x] Context mapping: lot IDs, location hierarchy, product genealogy — `build_record_context()` with 3 enrichment rules (shift derivation, location composition, event normalization), 11 FACTS context fields
- [x] FACTS spec for whk-wms adapter conformance — `whk-wms.facts.json` (14 data sources, 48 tests, hash-approved)
- [ ] FQTS specs for WMS data quality requirements
- [ ] Integration test suite against whk-wms staging environment (scaffold ready, requires WMS Docker stack)
- [x] Backfill capability for historical data — `BackfillProvider` interface implemented (stub pending live GraphQL)

**Gate F32-GATE:** 🚪 Adapter connects to whk-wms, collects contextual records, passes FACTS and FQTS specs.

---

### F33: WHK MES Adapter
**Effort:** Medium | **Dependencies:** F30, F31 | **Gate:** F32-GATE (parallel with F32)

Second production adapter — connects Forge to `whk-mes`.

**Deliverables:**
- [x] Adapter for `whk-mes` APIs — `WhkMesAdapter` with 5 capability mixins (WritableAdapter, SubscriptionProvider, BackfillProvider, DiscoveryProvider), 18 connection params, protocol `graphql+amqp+mqtt`
- [x] Data sources: 11 mapper functions across 8 modules — production orders, batches, recipes (class/instance pattern), schedule orders, equipment (ISA-88 hierarchy), operational events (step + production), business entities, lots, material items
- [x] Context mapping: 15 FACTS field mappings (6 mandatory + 10 optional) + 3 enrichment rules (shift from Louisville timezone, event type normalization for 30+ MES domain events, equipment_id from MQTT topic)
- [x] FACTS spec for whk-mes adapter conformance — `whk-mes.facts.json` (17 data sources, 64 tests, hash-approved, MQTT+write support)
- [ ] FQTS specs for MES data quality requirements (deferred to live)
- [ ] Integration test suite against whk-mes staging environment (scaffold ready, requires MES Docker stack)
- [x] Backfill capability for historical data — `BackfillProvider` interface implemented (stub pending live GraphQL)
- [x] Unit test suite: 188 MES adapter tests (28 adapter + 45 context + 30 record builder + 85 mappers), 650 total project tests passing

**Gate F33-GATE:** 🚪 Adapter connects to whk-mes, collects contextual records, passes FACTS and FQTS specs.

---

### F34: Adapter Transport Layer (gRPC + Protobuf)
**Effort:** Medium | **Dependencies:** F02, F30 | **Gate:** F34-GATE

Replace direct GraphQL/AMQP polling with gRPC + Protobuf as the canonical
hub↔spoke adapter transport. This is the foundation for live adapter
connections (F32-live, F33-live) and bidirectional data flow.

**Context:** Path 3 (WMS Adapter) proved that mappers, context builders, and
record builders are transport-agnostic — they transform dicts to models without
knowing whether the dict came from GraphQL, RabbitMQ, or gRPC. F34 adds the
transport layer beneath the existing adapter interface.

**Deliverables:**
- [x] Protobuf `.proto` definitions — 4 files: `enums.proto` (14 enums), `contextual_record.proto` (7 messages), `adapter.proto` (8 messages), `adapter_service.proto` (11 RPCs + request/response types). `RecordValue.raw` uses `oneof typed_value` with 6 variants.
- [x] `AdapterService` gRPC service definition: 5 control plane RPCs (`Register`, `Configure`, `Start`, `Stop`, `Health`), 3 data plane RPCs (`Collect`, `Subscribe`, `Unsubscribe` — server-streaming), 3 capability RPCs (`Write`, `Backfill`, `Discover`)
- [x] Python gRPC server (hub-side): `AdapterServiceServicer` with session management, record queues, `InMemoryServicer` for testing
- [x] Python gRPC client (spoke-side): `SpokeClient` with `TransportChannel` abstraction, `InMemoryChannel` for testing
- [x] TypeScript gRPC sidecar skeleton: `sidecars/whk-sidecar/` with types, gRPC client, adapter bridge (abstract + mock), entry point. Packages: `@grpc/grpc-js`, `@grpc/proto-loader`, `mqtt`, `graphql-request`
- [ ] Bidirectional transform scaffolding: `unmap_*` function signatures (deferred — requires live system field mapping verification)
- [x] Pydantic ↔ Protobuf serialization utilities: `pydantic_to_proto()` and `proto_to_pydantic()` with type registry for 10 model types. Handles `oneof` typed values, timestamp conversion, enum mapping, JSON-encoded extras.
- [x] FACTS spec for gRPC transport: `adapter-transport.facts.json` (50 conformance tests, 4 proto files, 11 RPCs, 14 enums)
- [x] Performance benchmark: Proto dict serialize 1.10x faster than JSON serialize. Real Protobuf binary estimated 50-70% smaller wire size.
- [x] Unit tests: 73 transport tests (serialization round-trips, hub server lifecycle, spoke client streaming, WMS/MES transport adapter wrapping). 723 total project tests passing.
- [x] `GrpcTransportAdapter` wrapper: wraps any `AdapterBase` subclass for gRPC streaming with zero adapter code changes. Verified with both WhkWmsAdapter and WhkMesAdapter.
- [x] **Hardened live gRPC transport:** Compiled protobuf stubs via `grpcio-tools` (no JSON on the wire). `GrpcServer` uses `add_AdapterServiceServicer_to_server` from compiled stubs. `GrpcChannel` uses compiled `AdapterServiceStub`. New `Ingest` RPC (client-streaming) for spoke→hub record push with gRPC metadata headers. `proto_bridge.py` for Pydantic↔Proto message conversion. 10 live gRPC integration tests. 863 total project tests passing.
- [x] **FTTS governance framework (Forge Transport Test Specification):** Schema (`ftts.schema.json`, 12 required sections), spec instance (`grpc-hardened-transport.ftts.json` — 31 message types, 14 enums, 12 RPCs, 11 type mappings, 3 enum mappings, 5 error code mappings), FTTSRunner (12 enforced fields, cross-field consistency checks, live module inspection mode), 35 runner tests. `adapter-transport.facts.json` updated with FTTS cross-reference. 898 total project tests passing.

**Key Design Decisions:**
- **Bidirectional but asymmetric:** Ingestion (`map_*`) is lossy — coalesces spoke fields. Writeback (`unmap_*`) needs `source_id` + change delta, not full replacement.
- **Spoke sidecars:** Each spoke (WMS, MES) runs a thin gRPC server that translates between its native API (GraphQL, MQTT, REST) and the Forge protobuf contract. The adapter class on the hub calls the sidecar, not the spoke directly.
- **Proto as governance artifact:** `.proto` files are checked into the repo alongside FACTS specs. Changes require the same review process as spec changes.
- **Backward compatible:** Existing adapter classes keep the same Python interface (`configure`, `start`, `collect`, `subscribe`). Only the transport beneath changes.

**Gate F34-GATE:** 🚪 ContextualRecord round-trips through proto serialization without data loss. gRPC `Collect` stream delivers records from spoke sidecar to hub. Latency benchmark shows improvement over REST/JSON baseline. FACTS spec passes.

---

## Curation & Data Products (F4x)

### F40: Curation Service
**Effort:** Large | **Dependencies:** F20, F21, F22 | **Gate:** F40-GATE

Transforms raw contextual records into decision-ready data products.

**Deliverables:**
- [x] `forge-curation` FastAPI service: 8 endpoints (healthz, curate, CRUD products, lineage, quality), injectable dependencies, OpenAPI docs
- [x] Normalization engine: `UnitRegistry` with 10 WHK conversions (°F↔°C, gal↔L, proof↔ABV, lb↔kg, psi↔kPa, K↔°C, bbl↔L, wine_bbl↔L, oz↔kg, bar↔kPa), `TimeBucketer` (10 named windows from 1s to 1day), `ValueNormalizer` (unit conversion + string normalization)
- [x] Aggregation engine: 9 functions (MIN, MAX, AVG, SUM, COUNT, FIRST, LAST, MEDIAN, STDDEV), group-by context keys + time bucket, in-memory equivalent of TimescaleDB continuous aggregates
- [x] Data product registry: `ProductStore` ABC + `InMemoryProductStore`, full lifecycle (DRAFT → PUBLISHED → DEPRECATED → RETIRED), version tracking, field definitions, quality SLOs
- [x] Data product quality monitoring: 4 rule types (Completeness, Freshness, Range, Consistency), `QualityMonitor` per-product rule registration, `QualityReport` with per-SLO pass/fail + aggregate score
- [x] Lineage tracking: `LineageStore` ABC + `InMemoryLineageStore`, `LineageTracker` with step-by-step entry building, query by output/source/product
- [x] Curation pipeline: 5 composable `CurationStep` types (Normalize, TimeBucket, Aggregate, Enrich, Validate), `CurationPipeline` orchestrator producing `CurationResult` with output records + lineage + quality report
- [x] FACTS spec for curation endpoints: `curation.facts.json` (8 endpoints, 25 conformance tests)
- [x] FQTS spec for WHK data products: `whk-data-products.fqts.json` (3 products, 9 quality rules, 7 SLOs, 15 conformance tests)
- [ ] Continuous aggregation scheduling (TimescaleDB — deferred to F20-F22)

**Status:** 130 curation tests passing. 853 total project tests. All ruff-clean.

**Key Design Decisions:**
- **In-memory storage abstractions:** `ProductStore` and `LineageStore` ABCs with in-memory implementations. Same pattern as Path 5's `TransportChannel`/`InMemoryChannel`. Wirable to real databases (PostgreSQL, TimescaleDB) when F20-F22 land — curation logic doesn't change.
- **Pipeline as composable steps:** Each `CurationStep` is a pure function `process(records) → records`. Steps are independent, reorderable, testable in isolation. Different data products can have different pipeline configurations.
- **Lineage is first-class:** Every transformation step appends to the lineage chain. Each curated record knows exactly which raw records it was derived from and what transformations were applied.
- **Quality SLOs are declarative:** Defined as part of the DataProduct definition, evaluated inline during curation. Matches FQTS spec structure.
- **Normalization registry is extensible:** Unit conversions are registered, not hard-coded. WHK conversions are examples — any manufacturing domain can add its own.

**Gate F40-GATE:** 🚪 Raw contextual records from F32/F33 are transformed into at least 3 curated data products with full context, lineage, and passing FQTS specs.
**Gate Status:** Met — curation pipeline processes WMS and MES adapter records, produces normalized/aggregated output with full lineage, quality SLO evaluation inline. 3 WHK data product definitions registered in FQTS spec.

---

### F41: First Data Products (WHK)
**Effort:** Medium | **Dependencies:** F40, F32, F33 | **Gate:** F41-GATE

Produce the first decision-ready data products from combined WMS + MES data.

**Deliverables:**
- [ ] **Production Context Dataset** — batch/lot records with process parameters, material genealogy, equipment state, quality results, all normalized and time-aligned
- [ ] **Inventory-Production Linkage** — WMS inventory movements linked to MES production orders with material genealogy
- [ ] **Equipment Utilization Dataset** — equipment state timeline with batch context, shift context, maintenance windows
- [ ] Each product: registered schema, FQTS quality specs, FLTS lineage specs, owner, SLOs
- [ ] Cross-system normalization examples (same entity referenced differently in WMS vs MES)

**Gate F41-GATE:** 🚪 All 3 data products pass FQTS quality specs. Lineage is complete from source adapters through to curated product. Context preservation verified.

---

## Serving Layer & APIs (F5x)

### F50: Query Federation Service
**Effort:** Large | **Dependencies:** F22, F40 | **Gate:** F50-GATE

Unified query interface across all storage engines.

**Deliverables:**
- [ ] GraphQL federation layer (NestJS + Apollo Federation)
- [ ] Time-series query delegation (TimescaleDB)
- [ ] Relational query delegation (PostgreSQL)
- [ ] Graph query delegation (Neo4j)
- [ ] Cross-engine join capability
- [ ] Query optimization and caching
- [ ] FATS specs for federation endpoints
- [ ] FPTS specs for query latency benchmarks

**Gate F50-GATE:** 🚪 A single query retrieves sensor data (TimescaleDB) + batch context (PostgreSQL) + equipment topology (Neo4j) in one response.

---

### F51: Streaming & Subscriptions
**Effort:** Medium | **Dependencies:** F03, F22 | **Gate:** F51-GATE

Real-time data delivery for consuming applications.

**Deliverables:**
- [ ] Kafka Connect sink connectors for external consumers
- [ ] WebSocket streaming endpoint for real-time dashboards
- [ ] Server-Sent Events (SSE) for lightweight consumers
- [ ] Webhook delivery service with retry and dead-letter queue
- [ ] CDC (Change Data Capture) from PostgreSQL for downstream sync
- [ ] FATS specs for all streaming endpoints

**Gate F51-GATE:** Real-time sensor data flows from adapter → Kafka → consumer within 5s. Webhooks deliver with retry.

---

## Decision Support & Structured Challenge (F6x)

### F60: Decision Support Backend
**Effort:** Large | **Dependencies:** F05, F50 | **Gate:** F60-GATE

The NestJS backend implementing the BBD Part 2 structured challenge framework.

**Deliverables:**
- [ ] `forge-decision` NestJS service
- [ ] Decision Frame API: create, update, review, close decision workflows
- [ ] 13-point structured challenge workflow (from BBD Part 2)
- [ ] Assumption registry: track, validate, invalidate, link to decisions
- [ ] Evidence linking: attach data product queries as supporting/challenging evidence
- [ ] Reassessment trigger engine: monitor metrics, fire alerts when thresholds hit
- [ ] FATS specs for all decision support endpoints
- [ ] PostgreSQL schema for decision state

**Gate F60-GATE:** 🚪 Complete structured challenge workflow: create decision → add hypothesis → link evidence → add alternatives → track assumptions → set reassessment trigger → close with disposition.

---

### F61: Decision Support Frontend
**Effort:** Large | **Dependencies:** F60 | **Gate:** F61-GATE

The NextJS frontend for human-facing decision workflows.

**Deliverables:**
- [ ] `forge-portal` NextJS application (App Router, React Server Components)
- [ ] Decision workflow UI: guided 13-step form with evidence linking
- [ ] Assumption dashboard: active assumptions, confidence levels, reassessment dates
- [ ] Decision audit trail: who decided what, based on what evidence, with what assumptions
- [ ] Context-before-conclusion enforcement: normalization warnings on comparative views
- [ ] Integration with data products for evidence queries
- [ ] Responsive design, accessibility (WCAG 2.1 AA)

**Gate F61-GATE:** 🚪 End-to-end workflow: user creates decision → links evidence from data products → system enforces challenging evidence requirement → assumption tracked → reassessment scheduled.

---

## Observability & Operations (F7x)

### F70: Observability Stack
**Effort:** Medium | **Dependencies:** F04, F05 | **Gate:** F70-GATE

**Deliverables:**
- [ ] OpenTelemetry Collector in Docker Compose
- [ ] Prometheus for metrics (scrape all Forge services)
- [ ] Loki for structured logs
- [ ] Tempo for distributed traces
- [ ] Grafana with pre-provisioned dashboards (Platform Overview, Data Quality, Adapter Monitor, Performance)
- [ ] All Forge services instrumented with OpenTelemetry SDK
- [ ] FOTS specs for observability requirements
- [ ] `forge observe` CLI subcommand: `status`, `metrics`, `logs`, `traces`

**Gate F70-GATE:** All services emit metrics, logs, and traces. Grafana dashboards render. FOTS specs pass.

---

### F71: SLO Framework
**Effort:** Small | **Dependencies:** F70 | **Gate:** F71-GATE

**Deliverables:**
- [ ] SLO definitions for all core services (availability, latency, freshness)
- [ ] Error budget tracking
- [ ] Alerting rules (Prometheus AlertManager)
- [ ] SLO dashboard in Grafana
- [ ] FOTS specs for SLO compliance

**Gate F71-GATE:** SLOs defined, measured, and alerting on breach.

---

## Security, Compliance & Hardening (F8x)

### F80: Authentication & Authorization
**Effort:** Medium | **Dependencies:** F05 | **Gate:** F80-GATE

**Deliverables:**
- [ ] SSO integration (OIDC/SAML)
- [ ] JWT token management
- [ ] API key management
- [ ] RBAC model with roles: admin, operator, analyst, adapter, system
- [ ] ABAC for fine-grained data access (row-level security)
- [ ] FSTS specs for auth security requirements
- [ ] Audit trail for all auth events

**Gate F80-GATE:** 🚪 FSTS specs pass. SSO login, JWT refresh, API key auth, and RBAC enforcement all working.

---

### F81: Compliance Framework
**Effort:** Medium | **Dependencies:** F80 | **Gate:** F81-GATE

**Deliverables:**
- [ ] 21 CFR Part 11 controls: e-signatures, audit trails, data integrity
- [ ] Data classification engine (Public, Internal, Confidential, Restricted)
- [ ] Retention policy engine
- [ ] PII detection and anonymization pipeline
- [ ] Export controls (data residency, sovereignty)
- [ ] Compliance dashboard

**Gate F81-GATE:** Compliance controls pass internal audit checklist.

---

## Production Readiness & Deployment (F9x)

### F90: Kubernetes Deployment
**Effort:** Large | **Dependencies:** F70, F80 | **Gate:** F90-GATE

**Deliverables:**
- [ ] Helm charts for all Forge services
- [ ] StatefulSets for databases
- [ ] HPA for stateless services
- [ ] Network policies for micro-segmentation
- [ ] PVC templates for persistent storage
- [ ] Ingress with TLS termination
- [ ] Secrets management (Vault integration)
- [ ] CI/CD pipeline: build → test (FxTS) → deploy staging → deploy production

**Gate F90-GATE:** 🚪 Full Forge stack deploys to K8s, passes all FxTS specs, survives node failure.

---

### F91: Upgrade & Lifecycle
**Effort:** Medium | **Dependencies:** F90 | **Gate:** F91-GATE

**Deliverables:**
- [ ] `forge upgrade` command (binary + Docker instances, adapted from MDEMG)
- [ ] Rolling upgrade strategy for K8s
- [ ] Database migration safety (backward-compatible schema changes)
- [ ] Backup and restore automation
- [ ] `forge teardown` command with export-before-destroy

**Gate F91-GATE:** Upgrade from v0.x to v0.x+1 with zero downtime. Backup and restore verified.

---

## WHK-Specific Integration (FWx)

### FW01: WHK Reference Deployment
**Effort:** Large | **Dependencies:** F41, F60, F70, F80 | **Gate:** FW01-GATE

Full Forge deployment at WHK connecting production WMS and MES.

**Deliverables:**
- [ ] Production adapters for whk-wms and whk-mes
- [ ] WHK-specific data products (production context, inventory linkage, equipment utilization)
- [ ] WHK-specific FQTS quality specs
- [ ] Decision support workflows configured for WHK operational processes
- [ ] Grafana dashboards tailored to WHK KPIs
- [ ] Operator training materials
- [ ] Runbook for operations team

**Gate FW01-GATE:** 🚪 WHK production data flowing through Forge. Data products passing quality specs. Decision support workflows in use. Operators trained.

---

## Dependency Graph

```
F01 ─┬─► F02 ──────────────────────────┬─► F05 ──► F11 ──► FATS governs all future endpoints
     │                                  │     │
     ├─► F03 ──────────────────────────►│     ├─► F14 (security)
     │                                  │     ├─► F80 (auth)
     ├─► F04 ──────────────────────────►│     │
     │     │                            │     │
     │     ├─► F20 (schema registry) ──►├─────┤
     │     │                            │     │
     │     ├─► F22 (storage orch) ──────┤     │
     │     │                            │     │
     │     └─► F21 (context engine) ────┤     │
     │                                  │     │
     └─► F10 (FxTS core) ──┬─► F11     │     │
                            ├─► F12 ────┼─► F30 (adapter framework) ──┬─► F31 (examples)
                            ├─► F13     │                             ├─► F32 (whk-wms)
                            ├─► F14     │                             ├─► F33 (whk-mes)
                            └─► F15     │                             └─► F34 (gRPC transport)
                                        │                                    │
                                        │                    F32-live, F33-live ◄──┘
                                        │                                    │
                                        │                                    ▼
                                        └─► F40 (curation) ──► F41 (WHK data products)
                                                                       │
                                        F50 (federation) ◄────────────┘
                                              │
                                        F60 (decision backend) ──► F61 (decision frontend)
                                              │
                                        F70 (observability) ──► F71 (SLOs)
                                              │
                                        F80 (auth) ──► F81 (compliance)
                                              │
                                        F90 (K8s) ──► F91 (lifecycle)
                                              │
                                        FW01 (WHK reference deployment)
```

---

## Release Milestones

| Version | Milestone | Phases Required | Description |
|---------|-----------|-----------------|-------------|
| **v0.1** | Foundation | F01–F05, F10–F12 | Core infrastructure + FxTS governance + API gateway |
| **v0.2** | Storage & Context | F20–F22 | Schema registry, context engine, storage orchestration |
| **v0.3** | First Adapters | F30–F34 | Adapter framework + WHK WMS/MES adapters + gRPC transport |
| **v0.4** | Data Products | F40–F41 | Curation service + first WHK data products |
| **v0.5** | Serving | F50–F51 | Query federation + streaming |
| **v0.6** | Decision Support | F60–F61 | Structured challenge workflows + portal |
| **v0.7** | Operations | F70–F71, F13–F15 | Full observability + remaining FxTS frameworks |
| **v0.8** | Security | F80–F81, F14 | Auth, compliance, hardening |
| **v0.9** | Production | F90–F91 | K8s deployment, upgrade automation |
| **v1.0** | WHK Live | FW01 | WHK reference deployment in production |

---

## Effort Estimates

| Phase | Effort | Dependencies | Parallelizable With |
|-------|--------|-------------|---------------------|
| F01 | 1 week | None | — |
| F02 | 1-2 weeks | F01 | F03, F04, F10 |
| F03 | 1 week | F01 | F02, F04, F10 |
| F04 | 2 weeks | F01 | F02, F03, F10 |
| F05 | 2 weeks | F02, F04 | F11 (starts after F05) |
| F10 | 2 weeks | F01 | F02, F03, F04 |
| F11 | 2 weeks | F10, F05 | F12 |
| F12 | 1-2 weeks | F10 | F11, F13, F14, F15 |
| F13 | 1-2 weeks | F10, F04 | F12, F14, F15 |
| F14 | 1 week | F10, F05 | F12, F13, F15 |
| F15 | 2 weeks | F10 | F12, F13, F14 |
| F20 | 2 weeks | F04, F05 | F21, F22 |
| F21 | 3-4 weeks | F04, F05, F20 | F22 |
| F22 | 2 weeks | F04, F20 | F21 |
| F30 | 2-3 weeks | F02, F03, F12 | F20, F21 |
| F31 | 2 weeks | F30 | F32, F33 |
| F32 | 2-3 weeks | F30, F31 | F33, F34 |
| F33 | 2-3 weeks | F30, F31 | F32, F34 |
| F34 | 2-3 weeks | F02, F30 | F32-live, F33-live, F40 |
| F40 | 3-4 weeks | F20, F21, F22 | — |
| F41 | 2-3 weeks | F40, F32, F33 | F50 |
| F50 | 3-4 weeks | F22, F40 | F41 |
| F51 | 2 weeks | F03, F22 | F50 |
| F60 | 3-4 weeks | F05, F50 | F70 |
| F61 | 3-4 weeks | F60 | F70 |
| F70 | 2-3 weeks | F04, F05 | F60 |
| F71 | 1 week | F70 | F80 |
| F80 | 2-3 weeks | F05 | F70 |
| F81 | 2-3 weeks | F80 | F90 |
| F90 | 3-4 weeks | F70, F80 | — |
| F91 | 2 weeks | F90 | FW01 |
| FW01 | 4-6 weeks | F41, F60, F70, F80 | — |

**Critical path:** F01 → F02/F04 → F05 → F20/F21 → F30 → F32/F33 → F34 → F40 → F41 → FW01

**Estimated total (sequential):** ~12-15 months
**Estimated total (with parallelization):** ~8-10 months to v1.0

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| whk-wms/whk-mes API instability during adapter development | High | Medium | Develop against staging, use contract tests (FACTS), circuit breaker pattern |
| FxTS framework overhead slows development velocity | Medium | Medium | Start with FATS + FACTS only, add others as needed. Spec-first pays off in later phases |
| Kafka operational complexity | Medium | Low | Start with single-broker, KRaft mode. Upgrade to cluster when traffic warrants |
| Cross-engine query performance | High | Medium | Start simple (sequential queries), optimize with caching and materialization |
| Decision support adoption resistance | Medium | High | Start with low-friction workflows, demonstrate value on one decision type first |
| Context engine completeness | High | Medium | Prioritize equipment + batch context first, add shift/mode/material incrementally |

---

*This phased plan is the implementation roadmap for the Forge platform. Each phase produces FxTS specs before implementation code, ensuring spec-first governance throughout. Update completion markers as work progresses.*

**Document Owner:** reh3376
**Version:** 0.1 — April 2026
