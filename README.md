# Forge Platform

**General industrial / manufacturing decision matrix infrastructure.** Forge is a hub-and-spoke platform that transforms raw operational data from manufacturing systems into decision-quality information — structured, governed, and actionable.

**Start here:** [What Forge will be](docs/VISION.md) · [Where we are going](docs/WHERE-WE-ARE-GOING.md) · [Where we are](docs/WHERE-WE-ARE.md) · [Roadmap](docs/ROADMAP.md) · [Backlog](BACKLOG.md) · [Principles](docs/PRINCIPLES.md)

---

## What Forge Does

Forge solves Industry / Manufacturing dataOPS.  Organizations run on dozens of disconnected systems: WMS, MES, SCADA, CMMS, ERP, QMS, historians, ... . These systems are usually highly customized by use case. Each produces data in its own format with its own assumptions. Forge connects them through a common data model (ContextualRecords) and governance framework (FxTS) so decision-makers get trustworthy, correlated information rather than raw telemetry from siloed sources. Additionally, Forge Core curates datasets for various ML and AI use cases: human-in-the-loop semi-autonomous decision making, expertise-specific training, analytics, observability and monitoring.

**The core thesis**: Bad decisions in manufacturing don't come from lack of data — they come from lack of data *quality*, *context*, and *correlation*. Forge addresses all three. Poor decisions are far more costly than generally realized, the cost is frequently spread across many units, and the root cause of a confidently wrong decision is rarely captured.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         FORGE HUB                                │
│                                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Core     │  │ Curation  │  │ Storage  │  │ Governance    │  │
│  │ Models   │  │ Pipeline  │  │ Router   │  │ (FxTS Suite)  │  │
│  └──────────┘  └───────────┘  └──────────┘  └───────────────┘  │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ gRPC     │  │ Observer  │  │ CLI      │  │ SDK           │  │
│  │Transport │  │ System    │  │ (forge)  │  │ (Module Bldr) │  │
│  └──────────┘  └───────────┘  └──────────┘  └───────────────┘  │
└───────────────────────┬──────────────────────────────────────────┘
                        │ gRPC + Protobuf (compiled binary)
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
   ┌────────────┐ ┌──────────┐ ┌────────────┐
   │ OT Module  │ │ WHK-CMMS │ │ WHK-WMS    │   ... (10 spokes)
   │ (OPC-UA,   │ │ Adapter  │ │ Adapter    │
   │  MQTT,     │ │          │ │            │
   │  Alarms,   │ │          │ │            │
   │  Control)  │ │          │ │            │
   └────────────┘ └──────────┘ └────────────┘
```

### Hub (this repo)

The hub owns the primary security / auth, data models, governance layer, storage orchestration, and gRPC transport. Every spoke connects through the hub — spokes never talk directly to each other.  Although spokes can publish to a Forge broker for real-time / near-real-time data. 

### Spokes (Modules/Adapters)

Each spoke wraps one production system and produces ContextualRecords that conform to the Forge data contract. Spokes are validated by FACTS specs before connecting.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Hub (forge-core, `src/forge`) | Python 3.12+ · FastAPI · Pydantic v2 · Typer CLI · uv · ruff · pytest (4,448 tests) |
| Management and integration modules (`go/`) | Go 1.26 · `go build`, `go vet`, `go test` in CI; module SDK scaffold (the Go forge-mes is FB-076) |
| Interim MES bridge (`modules/Forge MES`) | The migrated whk-mes application, NestJS 10 + Next.js 14, kept running only until the Go forge-mes module (FB-076) replaces it |
| User interfaces | forge-display renders every surface from FVTS specs (not built yet; the FVTS runner and reference renderer exist) |
| Transport | gRPC + Protobuf (compiled binary, never JSON-over-gRPC); mTLS in both directions |
| Databases | PostgreSQL 16 (hub), TimescaleDB (time series), Neo4j 5 (graph); hub-owned, modules get `mod_<name>` schemas |
| Messaging | RabbitMQ (AMQP), MQTT 3.1.1 (embedded broker); Kafka in the compose stack for later |
| OPC-UA | asyncua (asyncio client) behind a thin wrapper; i3X REST API over the tag engine |

**Language policy.** The hub is Python. Formal `forge-<service>` management and integration modules are Go, generated from the module SDK (roadmap decisions A-2, A-5). Spokes are Python inside the hub or external processes in any language that speaks the proto. forge-mes runs as the migrated TypeScript application until its Go rewrite (FB-076). No module writes its own UI: forge-display renders them from FVTS specs (A-3). The status of each choice is in [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) §6.

## Project Structure

```
src/forge/
├── core/                          # Hub core — models, broker, registry
│   ├── models/                    # ContextualRecord, Decision, Adapter, Manufacturing entities
│   │   └── manufacturing/         # ISA-95 hierarchy: MaterialItem, Lot, ProductionOrder, etc.
│   ├── broker/                    # Embedded MQTT 3.1.1 broker (topic engine, sessions)
│   ├── registry/                  # Context field registry
│   ├── schemas/                   # JSON Schema definitions
│   └── interfaces/                # Abstract protocols
│
├── curation/                      # Data quality pipeline
│   ├── pipeline.py                # Multi-stage normalization + enrichment
│   ├── normalization.py           # Field normalization, unit conversion
│   ├── aggregation.py             # Time-window aggregation
│   ├── quality.py                 # Quality scoring and validation
│   └── lineage.py                 # Data provenance tracking
│
├── transport/                     # Hub ↔ Spoke gRPC layer
│   ├── grpc_server.py             # Hub gRPC server
│   ├── grpc_channel.py            # Channel management with retry
│   ├── spoke_client.py            # Spoke-side gRPC client
│   ├── hub_server.py              # Hub-side connection handler
│   ├── proto_bridge.py            # Protobuf ↔ Python model conversion
│   ├── serialization.py           # Binary serialization
│   └── transport_adapter.py       # Adapter base for transport
│
├── storage/                       # Database orchestration (Hub owns all DBs)
│   ├── router.py                  # Query routing to appropriate engine
│   ├── pool.py                    # Connection pooling
│   ├── access.py                  # Permissioned access for modules
│   ├── backfill.py                # Historical data backfill
│   ├── shadow.py                  # Shadow writes for migration
│   └── engines/                   # Database engine adapters
│
├── governance/                    # FxTS Governance Suite
│   ├── facts/                     # Forge Adapter Compliance Test Suite
│   │   ├── schema/facts.schema.json
│   │   ├── specs/                 # Per-spoke compliance specs (9 spokes)
│   │   │   ├── ot-module.facts.json      (v0.5.0 — 21 data sources)
│   │   │   ├── whk-wms.facts.json
│   │   │   ├── forge-mes.facts.json
│   │   │   ├── whk-cmms.facts.json
│   │   │   ├── bosc-ims.facts.json
│   │   │   ├── whk-nms.facts.json
│   │   │   ├── whk-erpi.facts.json
│   │   │   ├── next-trend.facts.json
│   │   │   └── scanner-gateway.facts.json
│   │   └── runners/facts_runner.py
│   ├── ftts/                      # Forge Transport Test Suite
│   ├── fats/                      # Forge Adapter Test Suite
│   ├── fhts/                      # Forge Hub Test Suite
│   ├── fqts/                      # Forge Quality Test Suite
│   └── fsts/                      # Forge Storage Test Suite
│
├── observer/                      # Event observation system
│
├── context/                       # Request context management
│
├── proto_gen/                     # Generated Protobuf/gRPC Python code
│   └── forge/v1/                  # adapter.proto, contextual_record.proto, enums.proto
│
├── cli/                           # CLI entry point
│   └── main.py                    # `forge` command
│
├── sdk/                           # Developer SDK
│   ├── module_builder/            # Module scaffolder + generators
│   │   ├── scaffolder.py          # `forge new-module <name>` scaffolding
│   │   ├── generators.py          # Code generators for adapters
│   │   ├── manifest_builder.py    # manifest.json generator
│   │   └── cli.py                 # Module Builder CLI
│   │
│   └── scripting/                 # Python 3.12+ Script Engine (replaces Ignition Jython)
│       ├── engine.py              # ScriptEngine — discover, load, hot-reload
│       ├── sandbox.py             # ScriptSandbox — PEP 302 import allowlist
│       ├── triggers.py            # TriggerRegistry — @timer, @on_tag_change, @api.route
│       ├── rbac.py                # Script RBAC — area + tag-pattern permissions
│       ├── audit.py               # Script audit trail — append-only ring buffer
│       └── modules/               # forge.* SDK namespace (11 modules)
│           ├── tag.py             # forge.tag — read/write/browse/subscribe
│           ├── db.py              # forge.db — query/named_query/transaction
│           ├── net.py             # forge.net — HTTP client (async, typed)
│           ├── log.py             # forge.log — structured JSON logging
│           ├── alarm.py           # forge.alarm — ISA-18.2 alarm interface
│           ├── date.py            # forge.date — date/time with Java→Python pattern conversion
│           ├── dataset.py         # forge.dataset — tabular data (replaces BasicDataset)
│           ├── perspective.py     # forge.perspective — HMI/UI interaction
│           ├── file.py            # forge.file — sandboxed file I/O
│           ├── util.py            # forge.util — JSON, globals, messaging
│           └── security.py        # forge.security — user/role queries
│
├── adapters/                      # Spoke adapters (in-repo)
│   ├── forge_mes/                 # Forge MES hub-side spoke adapter (manifest, context mapper, 11 mappers) — module itself lives in modules/Forge MES/
│   └── whk_cmms/                  # CMMS adapter (first spoke, reference impl)
│       ├── adapter.py
│       ├── config.py
│       ├── context.py
│       ├── record_builder.py
│       ├── topics.py
│       └── mappers/               # Entity mappers (equipment, maintenance)
│
└── modules/                       # Full modules (in-repo)
    └── ot/                        # OT/SCADA Module (Phases 1-6 complete)
        ├── adapter.py             # OT Module adapter (AdapterBase + DiscoveryProvider)
        ├── manifest.json          # Module manifest
        ├── opcua_client/          # OPC-UA async client (asyncua wrapper)
        │   ├── __init__.py        # OpcuaClient, converters, connection management
        │   └── paths.py           # PathNormalizer (OPC-UA ↔ Ignition ↔ Forge)
        ├── tag_engine/            # Tag management engine
        │   ├── engine.py          # TagEngine — CRUD, subscriptions, quality tracking
        │   ├── models.py          # TagDefinition, TagValue, QualityCode, DataType
        │   ├── registry.py        # Tag registry with metadata
        │   ├── templates.py       # UDT template system
        │   ├── persistence.py     # Tag config persistence
        │   └── providers/         # Tag value providers (8 types)
        │       ├── opcua_provider.py      # Direct OPC-UA reads
        │       ├── acquisition.py         # Scheduled polling
        │       ├── memory_provider.py     # In-memory tags
        │       ├── expression_provider.py # Calculated tags
        │       ├── query_provider.py      # SQL-driven tags
        │       ├── virtual_provider.py    # Virtual/derived tags
        │       ├── event_provider.py      # Event-driven tags
        │       └── base.py                # Provider protocol
        ├── i3x/                   # CESMII i3X integration (Smart Manufacturing)
        │   ├── models.py          # i3X type system models
        │   └── router.py          # i3X API router
        ├── alarming/              # ISA-18.2 Alarm Engine
        │   ├── engine.py          # AlarmEngine — evaluation loop, event journal
        │   ├── state_machine.py   # 7-state ISA-18.2 state machine
        │   ├── detector.py        # 9 alarm types (HI/HIHI/LO/LOLO/digital/ROC/quality/comm/custom)
        │   ├── models.py          # AlarmConfig, AlarmInstance, AlarmEvent, AlarmPriority
        │   ├── integrations.py    # MQTT publish, RabbitMQ fanout, CMMS work orders
        │   └── api.py             # REST API (/alarms/active, /history, /config, /ack, /shelve)
        ├── mqtt/                  # MQTT subsystem
        │   ├── publisher.py       # MQTT publish with QoS
        │   ├── subscriber.py      # MQTT subscribe with wildcard
        │   ├── tag_publisher.py   # Tag value → MQTT topic mapping
        │   ├── topic_router.py    # Topic pattern routing
        │   ├── sparkplug.py       # SparkplugB codec
        │   └── rate_limiter.py    # Per-topic rate limiting
        ├── control/               # Control Write Interface
        │   ├── write_engine.py    # ControlWriteEngine — 5-layer defense chain
        │   ├── validation.py      # WriteValidator — type/range checking
        │   ├── review.py          # WriteReviewer — two-step review tokens, reason codes (FB-074)
        │   ├── interlock.py       # InterlockEngine — safety conditions
        │   ├── authorization.py   # WriteAuthorizer — RBAC (Operator/Engineer/Admin)
        │   ├── audit.py           # WriteAuditLogger — pluggable sinks
        │   ├── recipe_integration.py  # MES recipe → batched PLC writes
        │   └── models.py          # WriteRequest, WriteResult, InterlockRule, WriteRole
        ├── bridge/                # Ignition Bridge Adapter (parallel operation)
        │   ├── adapter.py         # IgnitionBridgeAdapter — REST polling
        │   ├── client.py          # IgnitionRestClient — batch reads, auth, retry
        │   ├── tag_mapper.py      # TagMapper — Ignition↔Forge path conversion
        │   ├── dual_write.py      # DualWriteValidator — consistency checking
        │   ├── health.py          # BridgeHealthDashboard — operator acceptance
        │   └── models.py          # Bridge-specific models
        ├── context/               # ContextualRecord production
        │   ├── record_builder.py  # OT-specific record builder
        │   ├── resolvers.py       # Context field resolvers
        │   └── store_forward.py   # Store-and-forward for disconnected ops
        ├── acquisition/           # Data acquisition scheduling
        └── scripts/               # OT Module user scripts
```

### Module Directories (`modules/`)

First-party modules that ship with both a backend and a frontend live under the repo-level `modules/` directory, alongside the spoke templates copied from external repos:

| Directory | Sections | Status |
|-----------|----------|--------|
| `modules/Forge MES/` | `backend/` (NestJS + Prisma, forge-core integration), `frontend/` (Next.js 15), `shared/` | Migrated from `WhiskeyHouse/whk-mes` 2026-10-15; forge-mes replaces whk-mes. Hub-side spoke contract: `src/forge/adapters/forge_mes/` |
| `modules/Forge CMMS/`, `Forge ERPI/`, `Forge NMS/` | adapter template copies (`src/`, `specs/`, `docs/`, `tests/`) | Templates for the in-repo adapters |
| `modules/Forge DB Orchestration/` | storage framework copy | Reference |

## Governance: FxTS (Forge Test Specifications)

FxTS is **spec-first governance** — the specs define what must exist and the code conforms to the specs, not the other way around. This is not a testing framework; it's a compliance framework. Every spec is hashed and approved only by the owner.

| Framework | Governs | State |
|-----------|---------|-------|
| **FATS** | API contracts: routes, shapes, status codes | schema, runner, 28 specs (one per hub route) |
| **FACTS** | Adapter conformance: identity, capabilities, lifecycle, connection, data contract, context mapping, error handling | schema, runner, 9 specs |
| **FTTS** | Transport: TLS, tokens, streaming behaviour | schema, runner, 1 spec |
| **FVTS** | Module ↔ display contract: points, alarms, actions, surfaces, profiles | schema, runner, reference renderer, 1 spec |
| **FHTS** | Hash integrity and owner approval of every spec above | hashing in the shared runner; `forge governance specs / stamp / approve` |
| FQTS · FSTS | Data quality · security controls | stubs |
| FDTS · FLTS · FNTS · FOTS · FPTS | Schema evolution · lineage · normalization · observability · performance | planned |

### FACTS Specs (9 spokes)

Each spoke has a FACTS spec that declares its identity, capabilities, connection parameters, data sources, context field mappings, enrichment rules, error handling policy, and sample records. The spec is the contract — if the spoke doesn't match its spec, it can't connect.

| Spoke | System (data sources) | Spec |
|-------|-----------------------|------|
| `whk-wms` | Warehouse management (GraphQL, RabbitMQ, REST; 14 sources) | v0.1.0 — approved (reh3376) |
| `forge-mes` | Manufacturing execution, `modules/Forge MES` (GraphQL, RabbitMQ, MQTT, REST, WebSocket, database; 18 sources) | v0.1.0 — approved 2026-10-15 (reh3376) |
| `bosc-ims` | Aerospace inventory (gRPC unary and stream; 8 sources) | v0.1.0 — approved (no approver recorded) |
| `whk-cmms` | Maintenance management (GraphQL, REST, RabbitMQ; 5 sources) | v0.1.0 — pending review (FB-080 re-stamp) |
| `whk-erpi` | ERP integration, NetSuite (RabbitMQ, REST, GraphQL; 5 sources) | v0.1.0 — pending review (FB-080 re-stamp) |
| `whk-nms` | Network management (REST, WebSocket; 11 sources) | v0.1.0 — pending review (FB-080 re-stamp) |
| `next-trend` | Time-series historian (REST, WebSocket; 5 sources) | v0.1.0 — pending review (FB-080 re-stamp) |
| `scanner-gateway` | Barcode scanner gateway (gRPC server unary and stream; 5 sources) | v0.1.0 — pending review (FB-080 re-stamp) |
| `ot-module` | OPC-UA, MQTT, alarms, control writes, scripting (21 sources) | v0.5.0 — pending review; fails schema validation until D-8 (FB-079) |

`forge governance specs --pending` lists what awaits the owner; `forge governance run facts <spoke>` runs one spec.

## OT Module (Phases 1-6)

The OT Module is the most mature spoke, implemented directly in this repo. It replaces Ignition SCADA as the OT/HMI/SCADA layer.

### Phase Summary

| Phase | Name | What It Does |
|-------|------|-------------|
| 1 | OPC-UA Client | asyncua wrapper, tag engine with 8 provider types, path normalization (OPC-UA ↔ Ignition ↔ Forge), i3X discovery |
| 2 | Scripting Engine | Python 3.12+ script engine replacing Jython 2.7, ScriptSandbox (PEP 302), TriggerRegistry decorators, RBAC, audit trail, 11 forge.* SDK modules |
| 3 | Alarm Engine | ISA-18.2 compliant: 7-state machine, 9 alarm types, event-sourced journal, cross-module integration (MQTT, RabbitMQ, CMMS auto-work-orders) |
| 4 | Control Write | 5-layer defense chain (validation → review → interlocks → RBAC → write+read-back), audit trail with pluggable sinks, MES recipe integration |
| 5 | Ignition Bridge | Parallel operation adapter: REST API polling, dual-write consistency validation (<1% threshold), operator acceptance checklist |
| 6 | Script Migration | 6 new forge.* SDK modules, API mapping for all 52 system.* calls, Tier 1 conversion targets identified (42 scripts) |

### forge.* SDK Modules

The scripting SDK provides 11 modules that replace Ignition's `system.*` namespace:

| Module | Replaces | Key Functions |
|--------|----------|---------------|
| `forge.tag` | `system.tag.*` | `read`, `write`, `browse`, `get_config`, `exists` |
| `forge.db` | `system.db.*` | `query`, `named_query`, `transaction`, `scalar` |
| `forge.net` | `system.net.*` | `http_get`, `http_post`, `http_put`, `http_delete` |
| `forge.log` | `system.util.getLogger` | `get`, `info`, `warning`, `error`, `debug` |
| `forge.alarm` | `system.alarm.*` | `get_active`, `ack`, `trigger`, `shelve`, `get_history` |
| `forge.date` | `system.date.*` | `now`, `format`, `parse`, `add_hours`, `seconds_between` |
| `forge.dataset` | `system.dataset.*` | `create`, `to_csv`, `from_csv`, `to_json`, `add_row` |
| `forge.perspective` | `system.perspective.*` | `send_message`, `navigate`, `open_popup`, `download` |
| `forge.file` | `system.file.*` | `read_text`, `write_text`, `exists`, `list_dir` (sandboxed) |
| `forge.util` | `system.util.*` | `json_encode`, `json_decode`, `get_globals`, `send_message` |
| `forge.security` | `system.security.*` | `get_username`, `get_user`, `has_role` |

## Connected Spokes (External Repos)

| Spoke | Repo | Tech | Role |
|-------|------|------|------|
| WHK-WMS | `WhiskeyHouse/whk-wms` | NestJS + Next.js | Warehouse Management |
| Forge MES | `modules/Forge MES` (in-repo; migrated from `WhiskeyHouse/whk-mes` on 2026-10-15) | NestJS 10 + Next.js 14 | Manufacturing Execution — forge-mes replaces whk-mes |
| WHK-CMMS | `reh3376/whk-cmms` | GraphQL + REST + RabbitMQ | Maintenance Management |
| BOSC-IMS | `reh3376/bosc_ims` | Go + gRPC | Aerospace Inventory |
| WHK-NMS | `WhiskeyHouse/net-topology` | FastAPI + Next.js | Network Management |
| WHK-ERPI | `reh3376/whk-erpi` | RabbitMQ + REST + GraphQL | ERP Integration (NetSuite) |
| NextTrend | `TheThoughtagen/nexttrend` | Rust + Next.js | Time-Series Historian |
| Scanner Gateway | `WhiskeyHouse/whk-wms-android` | Kotlin | Android Barcode Scanner |
| Ignition SCADA | `WhiskeyHouse/whk-ignition-scada` | Ignition 8.x | SCADA/HMI (being replaced) |
| Ignition Global | `WhiskeyHouse/whk-distillery01-ignition-global` | Jython 2.7 | Middleware scripts (being migrated) |

## Development

### Prerequisites

- Python 3.12+
- UV (package manager)
- Ruff (linter)
- Docker (for database services)

### Quick Start

```bash
# Clone
git clone https://github.com/reh3376/forge.git
cd forge

# Install from the lock (dev + ot extras); the same command CI and the hub image run
uv sync --locked --extra dev --extra ot

# Run tests
uv run pytest

# Lint and format checks (both block CI; ruff is pinned exactly so local and CI agree)
uv run ruff check .
uv run ruff format --check .

# Run specific test suite
uv run pytest tests/modules/ot/ -v           # OT Module tests
uv run pytest tests/sdk/scripting/ -v         # Scripting SDK tests
uv run pytest tests/core/ -v                  # Core tests
```

### Dependencies

`uv.lock` pins every Python dependency for every platform. CI, the hub image
(`deploy/docker/Dockerfile.forge`) and the quick start all install from it with
`uv sync --locked`, which fails when `pyproject.toml` and the lock disagree, so a dependency
moves only through a committed re-lock:

```bash
uv lock --upgrade-package fastapi    # one package, within its pyproject range
uv lock --upgrade                    # everything the ranges allow
uv sync --locked --extra dev --extra ot && uv run pytest   # then commit uv.lock with the change
```

### Test Coverage

```
Total:  4,448 tests collected (full suite green on 2026-10-27)
        259 test files
        354 source files

By area:
  OT module:                       1,129  (alarming, bridge, control, mqtt, tag_engine, opcua)
  Spokes (adapters):                 994
  Governance (FxTS):                 553  (FATS, FACTS, FTTS, FVTS runners and schemas)
  Scripting SDK, module builder:     356
  Core models, registry, context:    373
  Storage:                           317
  Transport, ingest, API, gateway:   246
  Curation:                          130
  Broker, integration, verification: 119
  CLI:                                20
  Repository (dependency lock):        7
```

Counts come from `uv run pytest --collect-only -q | tail -1`; `docs/WHERE-WE-ARE.md` §2 carries them and is updated before every push.

### Project Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| What Forge will be | `docs/VISION.md` | The finished system, the problems it solves, the definition of complete |
| Where we are going | `docs/WHERE-WE-ARE-GOING.md` | Direction: principles, milestones, what is next, what gates it |
| Where we are | `docs/WHERE-WE-ARE.md` | Component-by-component state snapshot, updated before every push that changes it |
| Roadmap | `docs/ROADMAP.md` | Decisions in force, workstreams, sequence and the owner decision queue (companion to `BACKLOG.md`) |
| Principles | `docs/PRINCIPLES.md` | Design principles, technical invariants, the governance pattern, the decision frame, technology decisions, origins, spoke priorities, lessons |
| Sprint Plan | `docs/p7-ot-module/P7_SPRINT_PLAN.md` | P7 OT Module 24-sprint plan |
| API Mapping | `docs/p7-ot-module/SYSTEM_TO_FORGE_API_MAP.md` | All 52 system.* → forge.* conversions |
| Conversion Targets | `docs/p7-ot-module/TIER1_CONVERSION_TARGETS.md` | 82 scripts classified (42 convert, 18 replace, 14 defer, 8 drop) |
| HMI Latency | `docs/p7-ot-module/HMI_LATENCY_CONTRACT.md` | UI response time contracts |

## Design Decisions

1. **Hub owns all databases**: Modules get permissioned access through the storage router — they never own their own database connections.

2. **gRPC + compiled Protobuf only**: Hub↔spoke communication uses compiled protobuf binary transport. JSON-over-gRPC is explicitly forbidden — it defeats the purpose of type-safe contracts.

3. **Spec-first governance**: FxTS specs define what must exist. Code conforms to specs. Specs are the source of truth, not the implementation.

4. **Thin wrapper over asyncua**: The OPC-UA client wraps asyncua with 6 converter functions at the boundary. asyncua owns the wire protocol; Forge owns the type system and operational concerns.

5. **Python 3.12+ everywhere**: No Jython, no Java interop. Scripts that previously ran on Ignition's Jython 2.7 VM are rewritten as native Python 3.12+ with the forge.* SDK.

6. **Every spoke needs approval**: Each new spoke compliance plan (FACTS spec) requires explicit review and approval before implementation begins.

---

*354 Python source files | 259 test files | 4,448 tests | 9 FACTS · 28 FATS · 1 FVTS · 1 FTTS specs | Python 3.12+ · Go 1.26 | Proprietary (licence model undecided, `docs/PRINCIPLES.md` §6)*
