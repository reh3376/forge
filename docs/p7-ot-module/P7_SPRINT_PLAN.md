# P7 OT Module — Sprint Development Plan v2.0

---

## 1. Header & Metadata

| Field | Value |
|-------|-------|
| **Plan ID** | P7-OT-MODULE-v2.0 |
| **Module** | Forge OT Module |
| **Priority** | 7 (Spoke Onboarding) |
| **Type** | New Build (not adapter wrapper) — Industrial Application Platform |
| **Replaces** | Inductive Automation Ignition SCADA + Ignition Global middleware |
| **Target Language** | Python 3.12+ (UV, Ruff) |
| **Scripting Language** | Python 3.12+ (replaces Ignition's Jython 2.7) |
| **Estimated Sprints** | 22–26 (across 7 phases) |
| **Estimated Duration** | 10–14 months |
| **Dependencies** | opcua-asyncio (reference only), Forge core models, NextTrend historian, whk-mes MQTT, whk-cmms asset registry |
| **FACTS Spec** | `ot-module.facts.json` (to be created in Phase 1) |
| **FTTS Spec** | `grpc-hardened-transport.ftts.json` (existing, shared) |
| **Research Doc** | `docs/p7-ot-module/P7_RESEARCH_SUMMARY.md` |
| **Competitive Analysis** | `docs/p7-ot-module/COMPETITIVE_ANALYSIS.md` |

---

## 2. Problem Statement

Whiskey House operates a distillery controlled by 4 primary Allen-Bradley ControlLogix L82E PLCs, 48+ FLEX remote I/O racks, 184 VFDs, and 53 instruments. All equipment connectivity flows through Inductive Automation's Ignition SCADA platform (two VMs, active-passive), which also hosts 241 Perspective HMI views and 1,539 Jython middleware scripts.

Ignition is strategically unsuitable for the Forge platform because:

1. **Gateway lock-in:** All data acquisition routes through Ignition's proprietary gateway, creating a single point of dependency that prevents Forge from directly accessing PLC data.
2. **Jython 2.7 scripting:** 1,539 Python 2.7-compatible scripts cannot leverage modern Python async, type safety, or the Forge governance framework (FACTS/FTTS). This is universally recognized as Ignition's single biggest weakness.
3. **No spec-first governance:** Ignition has no equivalent of FxTS — tag structures, alarm configurations, and data contracts are configured via GUI, not governed by machine-readable specifications.
4. **Vendor coupling:** Ignition licensing, upgrade cycles, and feature availability are controlled by Inductive Automation, not WHK engineering.
5. **Limited tag types:** Ignition's 6 tag types lack multi-source aggregation, event-driven triggers, and external data source integration.
6. **Closed ecosystem:** MQTT pub/sub requires $4,000+ Cirrus Link add-on. Batch control requires Sepasoft add-on. Every capability beyond the base is a separate purchase.

The OT Module replaces Ignition with a platform that **exceeds it in every meaningful capability**: 9 tag types (vs. 6), Python 3.12+ scripting (vs. Jython 2.7), built-in MQTT pub/sub (vs. $4K add-on), FACTS-governed configuration (vs. GUI-only), and ContextualRecord enrichment that no SCADA platform offers. See `COMPETITIVE_ANALYSIS.md` for the full competitive landscape (Ignition vs. AVEVA vs. Siemens WinCC vs. GE iFIX).

---

## 3. Scope & Constraints

### In Scope

- **Hardened OPC-UA Python client library** (forked from opcua-asyncio as reference)
- **9-type tag engine** (Standard/OPC, Memory, Expression, Query, Derived, Reference, Computed★, Event★, Virtual★)
- **Tag template system** (UDT equivalent — parameterized templates with alarm/history configs, inheritance)
- **Tag providers** (OPC-UA per PLC, Memory, Expression, Query, Event, Virtual)
- **i3X-compliant OPC-UA address space exposure** (CESMII i3X spec adapted to FxTS — browse, discovery, live values, SSE subscriptions)
- **Python 3.12+ scripting engine** (extends existing `forge.sdk` — new `forge.sdk.scripting` sub-package alongside `forge.sdk.module_builder`)
- **forge.* SDK namespace** (forge.tag, forge.db, forge.net, forge.log, forge.alarm, forge.api — connects via AdapterBase interfaces)
- **Script trigger system** (tag change, timer, event, alarm pipeline, REST endpoint handlers)
- **MQTT pub/sub engine** (real-time tag value publishing, alarm state broadcasting, MES command subscription)
- **Store-and-forward buffering** (local buffer for OPC-UA→hub connectivity loss)
- **Alarm engine** (ISA-18.2 state machine: acknowledge, suppress, shelve, clear)
- **Control write interface** (safety interlocks, audit trail, role-based authorization)
- **Context enrichment** (equipment_id → area, batch_id, recipe_id, operating_mode)
- **SQL Bridge equivalent** (bidirectional DB ↔ tag sync via Query tags + scripting)
- **FACTS specification** and FTTS transport compliance
- **Ignition bridge adapter** (temporary migration shim for parallel operation)
- **Progressive decommission plan** (area-by-area cutover with script migration)

### Out of Scope (Handled by Other Modules)

| Capability | Responsible Module | Status |
|------------|-------------------|--------|
| HMI/Operator UI | OT UI Builder (P9) | Future — depends on OT Module maturity |
| CMMS (work orders, equipment registry) | whk-cmms | Existing (P2 adapter done) |
| MES (recipes, production orders, changeover) | whk-mes | Existing (adapter done) |
| Time-series historian | NextTrend | Existing (P5 adapter done) |
| Barrel printing / WMS | whk-wms | Existing (adapter done) |
| Network monitoring | net-topology (NMS) | Existing (P3 adapter done) |

### Hard Constraints

1. **Safety:** Control writes MUST pass safety interlock validation before execution. No exceptions.
2. **gRPC binary:** Hub↔module transport uses compiled protobuf only (never JSON-over-gRPC).
3. **Python 3.12+:** No Jython, no Python 2 compatibility. Clean modern async.
4. **Spec-first:** FACTS spec written and passing before implementation of each phase.
5. **Zero data loss:** During migration, both Ignition and OT Module must produce data — no gaps.
6. **No Ignition patterns:** OT Module must NOT carry over Ignition-specific tag path notation, UDT structures, or gateway-centric coupling.

### Soft Constraints

- Prefer subscription-based acquisition over polling (lower latency, lower CPU)
- Prefer single-PLC-at-a-time rollout during testing
- Modbus TCP (Trane chillers) can be deferred to post-Phase 4
- i3X REST API server can be deferred to Phase 3+ (not needed for core acquisition)

---

## 4. Dependencies

### Upstream (must exist before P7 starts)

| Dependency | Status | Required By |
|------------|--------|-------------|
| Forge core models (AdapterBase, ContextualRecord, etc.) | ✅ Complete | Phase 1 |
| FACTS runner (vocabulary enforcement) | ✅ Complete | Phase 1 |
| FTTS transport (grpc-hardened-transport) | ✅ Complete | Phase 2 |
| whk-cmms adapter (equipment context) | ✅ Complete (P2) | Phase 3 (alarm→work order) |
| NextTrend historian (time-series storage) | ✅ Complete (P5) | Phase 2 (data flow validation) |
| whk-mes MQTT integration (changeover) | ✅ Complete | Phase 5 (bridge period) |

### External (must be arranged)

| Dependency | Owner | Required By | Status |
|------------|-------|-------------|--------|
| Test PLC access (L82E or L83 on OT network) | WHK Engineering | Phase 1 | **TBD** |
| OPC-UA certificate provisioning | WHK IT/Security | Phase 1 | **TBD** |
| FortiGate OT zone firewall rule for Forge server | WHK IT | Phase 1 | **TBD** |
| Operator training plan for new system | WHK Operations | Phase 6 | Future |

### Downstream (enabled by P7)

| Consumer | What P7 Provides | When |
|----------|------------------|------|
| OT UI Builder (P9) | i3X API, live tag values, alarm state, forge.* SDK | After Phase 3 |
| CMMS auto-work-orders | Alarm events via RabbitMQ + @forge.on_alarm scripts | Phase 3 |
| NextTrend direct ingestion | MQTT tag value publishing + REST batch write | Phase 2B |
| MES recipe loading | Direct OPC-UA write path (replaces MQTT) | Phase 4 |
| Custom integrations | forge.api.route REST endpoints (replaces WebDev) | Phase 2B |
| Dashboards/decision systems | MQTT tag value/alarm/health topics | Phase 2B |

---

## 5. Implementation Plan

### Phase 1: OPC-UA Library Hardening (Sprints 1–3)

**Objective:** Build a production-grade async Python OPC-UA client that reliably connects to Allen-Bradley ControlLogix PLCs.

#### Epic 1.1: Library Foundation (Sprint 1)

| # | Task | Details |
|---|------|---------|
| 1.1.1 | Create module structure | `src/forge/modules/ot/opcua_client/` with `__init__.py`, `client.py`, `types.py`, `security.py`, `exceptions.py` |
| 1.1.2 | Implement OPC-UA session management | Async context manager: `async with OpcUaClient(endpoint, security) as client:` |
| 1.1.3 | Implement Browse service | `client.browse(node_id) → list[BrowseResult]` — recursive namespace discovery |
| 1.1.4 | Implement Read service | `client.read(node_ids) → list[DataValue]` — single and batch reads |
| 1.1.5 | Implement Subscribe service | `client.subscribe(node_ids, callback, interval_ms)` — monitored item subscriptions |
| 1.1.6 | Define type system | `NodeId`, `DataValue`, `QualityCode`, `BrowseResult`, `Subscription`, `MonitoredItem` |
| 1.1.7 | Unit tests | Mock-based tests for all service methods, type serialization |

#### Epic 1.2: Security & Resilience (Sprint 2)

| # | Task | Details |
|---|------|---------|
| 1.2.1 | TLS/certificate authentication | `SecurityPolicy.Basic256Sha256`, PEM certificate loading, trust store management |
| 1.2.2 | Auto-reconnect with backoff | Exponential backoff (1s → 2s → 4s → ... → 60s max), session recovery, subscription re-establishment |
| 1.2.3 | Connection health monitoring | Keepalive interval, consecutive failure tracking, state machine (CONNECTING → CONNECTED → RECONNECTING → FAILED) |
| 1.2.4 | Write service | `client.write(node_id, value, data_type)` — single value write with type validation |
| 1.2.5 | History Read service | `client.read_history(node_ids, start, end) → list[HistoryValue]` — for backfill |
| 1.2.6 | Integration tests (mock server) | Use opcua-asyncio as a mock OPC-UA server for integration testing |

#### Epic 1.3: L82E Conformance & FACTS Spec (Sprint 3)

| # | Task | Details |
|---|------|---------|
| 1.3.1 | L82E-specific testing | Test against real PLC (or simulator) — browse address space, subscribe to tags, validate quality codes |
| 1.3.2 | Tag path normalization | `[WHK01]Distillery01/Utility01/LIT_6050B/Out_PV` → `WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV` |
| 1.3.3 | Write FACTS spec | `ot-module.facts.json` — 10 sections, all vocabulary-compliant, hash verified |
| 1.3.4 | Write adapter manifest | `manifest.json` — OT tier, opcua protocol, read+write+subscribe+backfill+discover capabilities |
| 1.3.5 | Performance benchmarking | Measure: connection time, subscription latency, browse time for 1000+ nodes, reconnect time |
| 1.3.6 | Documentation | OPC-UA library API reference, security configuration guide, L82E compatibility notes |

**Gate 1:** Library passes all unit tests, integration tests against mock server, and FACTS spec passes 34+ checks. If real PLC available, at least browse+subscribe confirmed working.

---

### Phase 2A: Tag Engine & Acquisition (Sprints 4–7)

**Objective:** Build the 9-type tag engine, tag template system, and multi-PLC acquisition pipeline that exceeds Ignition's tag system.

#### Epic 2A.1: Tag Engine Core (Sprint 4)

| # | Task | Details |
|---|------|---------|
| 2A.1.1 | Tag type definitions | Pydantic models: `StandardTag`, `MemoryTag`, `ExpressionTag`, `QueryTag`, `DerivedTag`, `ReferenceTag`, `ComputedTag`, `EventTag`, `VirtualTag` — all inheriting from `BaseTag` |
| 2A.1.2 | Tag registry | `TagRegistry` class: in-memory tag catalog with metadata (path, type, data_type, engineering_units, quality, area, equipment_id). CRUD operations. Hierarchical folder structure with slash-separated paths |
| 2A.1.3 | Tag evaluation engine | `TagEngine` class: dependency graph tracking, change propagation (when a source tag changes, dependent Expression/Derived/Computed tags re-evaluate). Async evaluation loop |
| 2A.1.4 | Tag properties model | Per-tag: value, quality, timestamp, data_type, engineering_units, description, metadata dict, scale config (raw_min, raw_max, scaled_min, scaled_max), clamp config |
| 2A.1.5 | Tag persistence | Tag definitions stored as JSON (Git-native). Runtime values in memory. Optional PostgreSQL persistence for Memory tags across restarts |
| 2A.1.6 | Tag scan classes | Configurable execution rates per group (critical: 100ms, high: 500ms, standard: 1s, slow: 5s). Tags assigned to scan classes |

#### Epic 2A.2: Tag Providers & OPC-UA Integration (Sprint 5)

| # | Task | Details |
|---|------|---------|
| 2A.2.1 | OPC-UA Provider | `OpcUaProvider` class: manages tag subscriptions for one PLC connection. Maps OPC-UA node IDs to tag paths. Auto-resubscribe on reconnect |
| 2A.2.2 | Connection manager | `AcquisitionEngine` class: manages N concurrent PLC connections via OPC-UA Providers, independent lifecycle per connection |
| 2A.2.3 | Memory Provider | `MemoryProvider`: key-value store for Memory tags. Explicit write via API/script/MQTT. Optional persistence to DB |
| 2A.2.4 | Expression Provider | `ExpressionProvider`: evaluates Python expressions referencing other tags. Dependency tracking for re-evaluation on change |
| 2A.2.5 | Query Provider | `QueryProvider`: executes SQL queries against configured databases on poll interval. Async with connection pooling |
| 2A.2.6 | Event Provider | `EventProvider`: receives values from MQTT messages, RabbitMQ events, or webhooks. Sets tag value on event arrival |
| 2A.2.7 | Virtual Provider | `VirtualProvider`: fetches from external sources (NextTrend history API, external DBs, REST APIs) with TTL cache |

#### Epic 2A.3: Tag Templates & i3X-Compliant Browse API (Sprint 6)

| # | Task | Details |
|---|------|---------|
| 2A.3.1 | Tag template system | `TagTemplate` class: parameterized templates with typed parameters (plc_connection, base_path, equipment_id, area). Template instances inherit tag definitions, alarm configs, history configs. Changes to template propagate to all instances |
| 2A.3.2 | Template instantiation | `template.instantiate(name, params)` → creates all child tags with resolved parameter values |
| 2A.3.3 | Built-in templates | `VFD_Drive`, `AnalogInstrument`, `DiscreteValve`, `MotorStarter` templates pre-built for common equipment patterns |
| 2A.3.4 | i3X Namespaces API | `GET /api/v1/ot/namespaces` → list PLC connections as i3X namespaces. Based on CESMII i3X spec (https://github.com/cesmii/i3X), adapted to FxTS governance. Avoids inventing a custom browse API |
| 2A.3.5 | i3X Object Types API | `GET /api/v1/ot/objecttypes?namespace=plc200` → equipment types from OPC-UA address space (maps to i3X ObjectType model) |
| 2A.3.6 | i3X Browse/Objects API | `GET /api/v1/ot/objects?namespace=plc200&path=Fermentation/` → child nodes, data types, access levels (i3X object instances). Address space cache with configurable refresh (default 5min), invalidate on reconnect |
| 2A.3.7 | i3X Values/History API | `GET /api/v1/ot/objects/value?path=...` → live value preview. `GET /api/v1/ot/objects/history?path=...` → delegated to NextTrend |
| 2A.3.8 | i3X Subscriptions (SSE) | `GET /api/v1/ot/subscriptions` → SSE stream for real-time value changes. Standard i3X subscription model for consuming apps |
| 2A.3.9 | Tag discovery | `POST /api/v1/ot/discover?namespace=plc200&recursive=true` → auto-create Standard tag definitions from PLC address space using i3X browse results |

#### Epic 2A.4: Context Enrichment & Store-and-Forward (Sprint 7)

| # | Task | Details |
|---|------|---------|
| 2A.4.1 | Area resolver | Tag path → area mapping (e.g., `WH/WHK01/Distillery01/*` → area="Distillery") |
| 2A.4.2 | Equipment resolver | Tag path → equipment_id mapping (from CMMS asset registry or local config) |
| 2A.4.3 | Batch/recipe context | Query MES for active batch_id, lot_id, recipe_id per area (REST or RabbitMQ) |
| 2A.4.4 | Quality code mapping | OPC-UA StatusCode → Forge QualityCode (GOOD/UNCERTAIN/BAD/NOT_AVAILABLE) |
| 2A.4.5 | Operating mode detection | Tag-based or MES-based equipment state (PRODUCTION/CIP/IDLE/STARTUP/SHUTDOWN/ERROR) |
| 2A.4.6 | ContextualRecord builder | `build_ot_record(tag, enrichment_context) → ContextualRecord` with full provenance |
| 2A.4.7 | Store-and-forward buffer | Local SQLite or file-based buffer when hub/MQTT connectivity is lost. Auto-flush on reconnect. Configurable retention (default 72h, 100MB max) |
| 2A.4.8 | AdapterBase implementation | `OTModuleAdapter(AdapterBase)` with configure, start, stop, health, collect, subscribe, discover, backfill |

**Gate 2A:** All 9 tag types functional with unit tests. i3X-compliant browse API returns PLC address space (namespaces, object types, objects, values). Tag templates instantiate correctly. 100+ tags streaming from at least 1 PLC (mock or real), producing valid ContextualRecords. Store-and-forward buffer tested for connectivity loss scenarios. Expression/Derived/Computed tags re-evaluate on dependency changes.

---

### Phase 2B: Python Scripting Engine & MQTT (Sprints 8–10)

**Objective:** Build the Python 3.12+ scripting engine (replacing Ignition's Jython 2.7) and the MQTT pub/sub engine.

#### Epic 2B.1: Scripting Engine Core — Extends Forge Module SDK (Sprint 8)

The scripting engine is a new sub-package within the existing `forge.sdk` — NOT a standalone system. This keeps it consistent with `forge.sdk.module_builder` and means any Forge module (not just OT) can eventually use scripting.

| # | Task | Details |
|---|------|---------|
| 2B.1.1 | forge.sdk.scripting package | New sibling to `forge.sdk.module_builder`. Contains: `engine.py` (ScriptEngine), `sandbox.py`, `triggers.py`, `modules/` (forge.* namespace implementations) |
| 2B.1.2 | ScriptEngine class | Discovers .py files in module's `scripts/` directory, parses decorators, registers handlers. File watcher for hot-reload. Configurable per-module script directory |
| 2B.1.3 | forge.tag SDK module | `forge.tag.read(path)`, `forge.tag.write(path, value)`, `forge.tag.browse(path)`, `forge.tag.get_config(path)` — connects to tag engine via existing `SubscriptionProvider` and `WritableAdapter` interfaces from `AdapterBase` |
| 2B.1.4 | forge.db SDK module | `forge.db.query(sql, params, db)`, `forge.db.named_query(name, params)`, `forge.db.transaction(db)` context manager — leverages same connection pooling infrastructure available to all adapters |
| 2B.1.5 | forge.net SDK module | `forge.net.http_get(url)`, `forge.net.http_post(url, json)`, `forge.net.http_put()`, `forge.net.http_delete()` — async, typed responses, timeout/retry |
| 2B.1.6 | forge.log SDK module | `forge.log.get(name)` → structured JSON logger correlated with script name and trigger context |
| 2B.1.7 | forge.alarm SDK module | `forge.alarm.get_active()`, `forge.alarm.ack(id)`, `forge.alarm.trigger(name, ...)` — ISA-18.2 state-aware, connects to OT Module alarm engine |
| 2B.1.8 | Sandbox enforcement | Import allowlist (forge.*, stdlib, approved pip packages). Block raw process spawning, raw sockets. Per-script CPU time limit (5s default), memory limit (256MB default) |

#### Epic 2B.2: Script Triggers & Hot Reload (Sprint 9)

| # | Task | Details |
|---|------|---------|
| 2B.2.1 | @forge.on_tag_change decorator | Register handler for tag path patterns (wildcards supported). Receives `TagChangeEvent(tag_path, old_value, new_value, quality, timestamp)` |
| 2B.2.2 | @forge.timer decorator | Register handler for periodic execution. Parameters: interval (str like "5s", "1m"), name, enabled. Managed by asyncio scheduler |
| 2B.2.3 | @forge.on_event decorator | Register handler for lifecycle events: startup, shutdown, plc_connected, plc_disconnected, tag_provider_change |
| 2B.2.4 | @forge.on_alarm decorator | Register handler for alarm state changes. Filter by priority, areas, alarm names. Receives `AlarmEvent` |
| 2B.2.5 | @forge.api.route decorator | Register REST endpoint handler. FastAPI-backed with automatic OpenAPI docs. Receives typed `Request`, returns `Response` |
| 2B.2.6 | Script hot-reload | File watcher (`watchfiles`) monitors `scripts/` directory. On change: unregister old handlers, re-import module, register new handlers. Zero-downtime |
| 2B.2.7 | Script RBAC integration | Each script file has an `__forge_owner__` attribute (or default from directory). Write operations in scripts check tag-level + area-level RBAC for the owner |
| 2B.2.8 | Script audit trail | Every `forge.tag.write()` and `forge.db.query()` call logged with: script name, trigger event, executing user, timestamp, old/new values |

#### Epic 2B.3: MQTT Pub/Sub Engine (Sprint 9–10)

| # | Task | Details |
|---|------|---------|
| 2B.3.1 | MQTT publisher core | `OTMqttPublisher` class: async connection to RabbitMQ MQTT plugin (or Mosquitto), configurable broker(s), auto-reconnect |
| 2B.3.2 | Topic router | Template-based topic resolution: `whk/whk01/{area}/ot/tags/{tag_path}` — mirrors MES `MqttEventPublishRule` pattern |
| 2B.3.3 | Tag value publishing | On each tag value change → publish JSON payload `{value, quality, timestamp, engineering_units, equipment_id}` to tag topic. Configurable QoS (default 0 for high-freq, 1 for critical), configurable retain |
| 2B.3.4 | Health topic publishing | PLC connection state → `whk/whk01/{area}/ot/health/{plc_id}` (retained, QoS 1) |
| 2B.3.5 | Equipment status takeover | Publish to `whk/whk01/{area}/equipment/cipState`, `mode`, `faultActive` etc. — taking over Ignition's current role |
| 2B.3.6 | Optional SparkplugB encoding | BIRTH/DATA/DEATH message encoding for NextTrend SparkplugB connector |
| 2B.3.7 | MQTT subscriber | Subscribe to MES topics (`recipe/next`, `changeover/state`) — command ingestion for Phase 4 write translation |
| 2B.3.8 | Publish rate limiting | Configurable per-tag throttle to prevent broker overload with 1000+ tag subscriptions |

#### Epic 2B.4: Data Pipeline & Testing (Sprint 10)

| # | Task | Details |
|---|------|---------|
| 2B.4.1 | Async record pipeline | `collect()` → async generator yielding ContextualRecords from all tag types (not just OPC-UA) |
| 2B.4.2 | Hub transport integration | gRPC protobuf binary transport to Forge hub (via GrpcTransportAdapter) |
| 2B.4.3 | NextTrend dual-path | Publish to NextTrend via both REST API (batch write) AND MQTT (for NextTrend MQTT connector) |
| 2B.4.4 | SQL Bridge equivalent | Bidirectional DB ↔ tag sync: Query tags read from DB, timer scripts write tags to DB. Replaces Ignition SQL Bridge transaction groups |
| 2B.4.5 | MQTT fan-out integration test | Mock PLC → OT Module → MQTT broker → test subscriber validates correct topics/payloads |
| 2B.4.6 | Script integration test | Script with @forge.on_tag_change → reads tag → writes Memory tag → triggers Expression tag re-eval |
| 2B.4.7 | End-to-end pipeline test | Mock PLC → Tag Engine → Scripts → ContextualRecord → Hub + MQTT + NextTrend (all output paths) |
| 2B.4.8 | Performance test | 100+ tags, 10+ scripts, measure: latency, throughput, script execution time, memory |

**Gate 2B:** forge.* SDK functional with all 6 modules. Scripts register via decorators, execute on triggers, produce correct side effects. MQTT fan-out working with tag values on correct topics. SQL Bridge equivalent demonstrated (DB ↔ tag bidirectional sync). Scripts testable via pytest outside the runtime. MQTT publish latency <100ms (p95).

---

### Phase 3: Alarm Engine (Sprints 11–13)

**Objective:** Implement ISA-18.2 compliant alarm management with cross-module integration and scripting pipeline hooks.

#### Epic 3.1: ISA-18.2 State Machine (Sprint 11)

| # | Task | Details |
|---|------|---------|
| 3.1.1 | Alarm state model | States: NORMAL, ACTIVE_UNACK, ACTIVE_ACK, CLEAR_UNACK, SUPPRESSED, SHELVED, OUT_OF_SERVICE |
| 3.1.2 | State transitions | Trigger/Clear/Acknowledge/Suppress/Shelve/Unshelve/Return-to-service actions |
| 3.1.3 | Alarm priority model | Levels: CRITICAL, HIGH, MEDIUM, LOW, DIAGNOSTIC |
| 3.1.4 | Alarm configuration | Per-tag alarm config: setpoint, deadband, delay, priority, description |
| 3.1.5 | Alarm persistence | PostgreSQL table for alarm state + history (event-sourced pattern) |

#### Epic 3.2: Alarm Detection & Processing (Sprint 12)

| # | Task | Details |
|---|------|---------|
| 3.2.1 | Threshold alarms | HI, HIHI, LO, LOLO on analog values with deadband |
| 3.2.2 | Digital alarms | State-change alarms on boolean tags |
| 3.2.3 | Rate-of-change alarms | ROC detection on analog values |
| 3.2.4 | Quality alarms | Auto-alarm when tag quality degrades from GOOD |
| 3.2.5 | Communication alarms | PLC connection loss / reconnect events |
| 3.2.6 | Alarm flood suppression | Configurable max active alarms per area; oldest auto-shelved |

#### Epic 3.3: Cross-Module Alarm Integration & Scripting (Sprint 13)

| # | Task | Details |
|---|------|---------|
| 3.3.1 | Alarm → MQTT publishing | Publish alarm state changes to `whk/whk01/{area}/ot/alarms/{alarm_id}` (retained, QoS 1). Payload includes: state, priority, tag_path, value, setpoint, timestamp, equipment_id. Enables dashboards to show live alarm status |
| 3.3.2 | Alarm → RabbitMQ events | Structured alarm events to RabbitMQ for cross-module workflows |
| 3.3.3 | Alarm → CMMS work order | CRITICAL/HIGH alarms auto-create work requests in CMMS via adapter |
| 3.3.4 | Alarm → NextTrend annotation | Alarm events written as annotations on corresponding tag history |
| 3.3.5 | Alarm REST API | CRUD for alarm config, query for active/historical alarms, acknowledge endpoint |
| 3.3.6 | Alarm ContextualRecord | Alarm events produce ContextualRecords with alarm-specific context fields |
| 3.3.7 | Alarm MQTT acknowledge | Subscribe to `whk/whk01/{area}/ot/alarms/{alarm_id}/ack` — allows remote alarm acknowledgment from dashboard/mobile (with auth token in payload) |
| 3.3.8 | Alarm pipeline scripting | @forge.on_alarm scripts fire on alarm state changes. Custom notification logic (Slack, Teams, webhook) via forge.net.* |
| 3.3.9 | FACTS spec update | Add alarm-related context fields, MQTT data sources, and alarm topics to ot-module.facts.json |

**Gate 3:** Alarm lifecycle tests pass (all ISA-18.2 state transitions). At least 1 threshold alarm triggers from mock PLC data, produces ContextualRecord, publishes to MQTT alarm topic, CMMS receives work order event, and @forge.on_alarm script fires correctly.

---

### Phase 4: Control Write Interface (Sprints 14–16)

**Objective:** Enable safe operator/system control writes to PLCs with full audit trail.

#### Epic 4.1: Safety Interlock Layer (Sprint 14)

| # | Task | Details |
|---|------|---------|
| 4.1.1 | Write request model | `WriteRequest(tag_path, value, data_type, requestor, reason, interlock_bypass=False)` |
| 4.1.2 | Pre-write validation | Type checking, range validation, engineering unit consistency |
| 4.1.3 | Interlock engine | Configurable safety rules: "cannot write to tag X while tag Y is in state Z" |
| 4.1.4 | Role-based write authorization | OPERATOR, ENGINEER, ADMIN roles with per-tag/per-area write permissions |
| 4.1.5 | Write confirmation (OPC-UA read-back) | After write, read the value back to confirm PLC accepted the change |

#### Epic 4.2: Audit Trail & Logging (Sprint 15)

| # | Task | Details |
|---|------|---------|
| 4.2.1 | Write audit log | PostgreSQL table: who, what, when, where, old_value, new_value, reason, interlock_status |
| 4.2.2 | Write ContextualRecord | Every control write produces a ContextualRecord with lineage |
| 4.2.3 | Failed write logging | Interlock rejections, authorization failures, OPC-UA errors all logged with full context |
| 4.2.4 | Write REST API | `POST /api/v1/ot/write` with JSON body, authentication, and interlock check |
| 4.2.5 | Batch write support | `POST /api/v1/ot/write/batch` for recipe download (multiple tags atomically) |

#### Epic 4.3: MES Recipe Write Integration (Sprint 16)

| # | Task | Details |
|---|------|---------|
| 4.3.1 | MQTT→OPC-UA recipe bridge | OT Module subscribes to `whk/whk01/{area}/recipe/next`, parses recipe JSON, translates to OPC-UA tag writes for recipe parameters on PLC |
| 4.3.2 | Changeover state subscription | Subscribe to `whk/whk01/{area}/changeover/state`, trigger write sequences on state transitions (e.g., CIP_COMPLETE → load next recipe) |
| 4.3.3 | Write-back confirmation via MQTT | OT Module publishes to `whk/whk01/{area}/equipment/recipeLoadedConfirm` after successful OPC-UA write + read-back (replaces Ignition's role) |
| 4.3.4 | Control write audit → MQTT | Every control write event published to `whk/whk01/{area}/ot/writes/{tag_path}` for audit dashboards |
| 4.3.5 | FACTS spec update | Add write-related data sources, MQTT subscription sources, and control audit context fields |
| 4.3.6 | End-to-end recipe test | MES recipe (MQTT) → OT Module subscriber → OPC-UA write → read-back → MQTT confirmation → MES receives ack |

**Gate 4:** Control writes execute safely on test PLC. Interlock engine prevents invalid writes. Full audit trail in PostgreSQL. Recipe download from MES confirmed working end-to-end.

---

### Phase 5: Ignition Bridge Adapter (Sprints 17–18)

**Objective:** Temporary migration adapter that reads from Ignition while OT Module is validated.

#### Epic 5.1: Bridge Adapter (Sprint 17)

| # | Task | Details |
|---|------|---------|
| 5.1.1 | Ignition REST client | Poll Ignition REST API for tag values (fallback data source) |
| 5.1.2 | Tag mapping | Map Ignition bracket-notation paths to Forge normalized paths |
| 5.1.3 | ContextualRecord conversion | Ignition tag values → ContextualRecords with `source.system="ignition-bridge"` |
| 5.1.4 | Dual-write validation | Compare OT Module direct values vs. bridge values, flag discrepancies |
| 5.1.5 | Health dashboard | Show side-by-side: OT Module vs. Ignition for same tag paths |

#### Epic 5.2: Parallel Operation Validation (Sprint 18)

| # | Task | Details |
|---|------|---------|
| 5.2.1 | Data consistency checker | Automated comparison of OT Module vs. Ignition bridge for 1000+ tags |
| 5.2.2 | Latency comparison | Measure and report OT Module direct latency vs. Ignition path |
| 5.2.3 | Coverage gap finder | Identify tags present in Ignition but not yet in OT Module subscription |
| 5.2.4 | Failover testing | Simulate OT Module failure → automatic fallback to Ignition bridge |
| 5.2.5 | Operator acceptance criteria | Documented checklist for operations team sign-off |

**Gate 5:** Dual-write running with <1% data discrepancy. All tag paths covered. Failover confirmed working.

---

### Phase 6: Script Migration (Sprints 19–20)

**Objective:** Convert Ignition Jython 2.7 scripts to Forge Python 3.12+ scripts using the forge.* SDK.

#### Epic 6.1: Script Conversion (Sprint 19)

| # | Task | Details |
|---|------|---------|
| 6.1.1 | Inventory Ignition scripts | Catalog all 1,539 Jython files by category: tag change, timer, WebDev, project library, alarm pipeline |
| 6.1.2 | Identify migration scope | Many scripts are already replaced by dedicated modules (CMMS→whk-cmms, MES→whk-mes, barrel printing→whk-wms). Identify only scripts that need OT Module equivalents |
| 6.1.3 | Convert system.* to forge.* | `system.tag.readBlocking()` → `await forge.tag.read()`, `system.db.runPrepQuery()` → `await forge.db.query()`, etc. |
| 6.1.4 | Convert WebDev endpoints | `doGet(request, session)` → `@forge.api.route("/path", methods=["GET"])` handlers |
| 6.1.5 | Add type hints and async | Convert synchronous Jython to async Python 3.12+ with proper type annotations |
| 6.1.6 | Script test suite | pytest tests for each converted script, mocking forge.* SDK calls |

#### Epic 6.2: Script Validation (Sprint 20)

| # | Task | Details |
|---|------|---------|
| 6.2.1 | Side-by-side execution | Run converted scripts alongside Ignition scripts, compare outputs |
| 6.2.2 | WebDev endpoint parity | Verify all REST endpoints return identical responses |
| 6.2.3 | Timer script validation | Confirm periodic scripts execute at correct intervals with correct side effects |
| 6.2.4 | Tag change script validation | Confirm tag change handlers fire on correct tags with correct behavior |

**Gate 6:** All required Ignition scripts converted to forge.* equivalents. Side-by-side validation shows identical behavior. pytest suite passing.

---

### Phase 7: Progressive Ignition Decommission (Sprints 21+)

**Objective:** Area-by-area cutover from Ignition to Forge OT Module.

#### Epic 7.1: Distillery Cutover (Sprint 21)

| # | Task | Details |
|---|------|---------|
| 7.1.1 | Distillery tag subscription | All PLC200 tags (fermenters, cookers, still, doubler) via OT Module |
| 7.1.2 | Distillery alarm migration | Move alarm configs from Ignition to OT Module alarm engine |
| 7.1.3 | Distillery control writes | Operator writes via OT Module (with interlock validation) |
| 7.1.4 | Distillery script activation | Enable converted forge.* scripts for distillery area |
| 7.1.5 | 2-week dual-write validation | Confirm zero data loss, zero alarm gaps |
| 7.1.6 | Operator sign-off | Operations team confirms distillery running on OT Module |

#### Epic 7.2: Remaining Areas (Sprints 22–24)

| Sprint | Area | PLC |
|--------|------|-----|
| 22 | Granary (milling, receiving) | PLC100 |
| 23 | Stillage + CIP | PLC200 (shared) |
| 24 | Utilities (boilers, cooling, RO) | PLC400 |

Each area follows the same pattern as Epic 7.1: subscribe → migrate alarms → enable writes → activate scripts → dual-validate → sign off.

#### Epic 7.3: Ignition Shutdown (Sprint 25–26)

| # | Task | Details |
|---|------|---------|
| 7.3.1 | Remove Ignition bridge adapter | Disable bridge data flow |
| 7.3.2 | Stop Ignition MQTT Engine/Transmission | Remove MQTT traffic source |
| 7.3.3 | Archive Ignition project backup | Final `.gwbk` export to archive |
| 7.3.4 | Archive Jython scripts | Final snapshot of all Ignition scripts for reference |
| 7.3.5 | Decommission Ignition VMs | WIGNVM01 and WIGNVM04 shutdown |
| 7.3.6 | Update documentation | Remove Ignition references from CLAUDE.md, architecture docs |
| 7.3.7 | Post-decommission monitoring | 30-day observation period for any regression |

**Gate 7:** All production areas confirmed on OT Module for ≥2 weeks. Zero data loss. Zero alarm gaps. All scripts migrated. Operator sign-off for all areas. Ignition VMs powered off.

---

## 6. Testing Plan

### Tier 1: Unit Tests (every sprint)

- OPC-UA client: mock-based tests for all service methods
- Tag engine: all 9 tag types (create, evaluate, dependency tracking, re-evaluation)
- Tag templates: parameter inheritance, instantiation, propagation
- Tag providers: OPC-UA, Memory, Expression, Query, Event, Virtual provider unit tests
- Store-and-forward: buffer write, buffer flush, retention enforcement
- forge.* SDK: forge.tag, forge.db, forge.net, forge.log, forge.alarm module tests
- Script engine: decorator registration, trigger dispatch, hot-reload, sandbox enforcement
- MQTT publisher: topic routing, payload serialization, rate limiting, SparkplugB encoding
- MQTT subscriber: command parsing, recipe JSON deserialization, changeover state handling
- Alarm engine: all ISA-18.2 state transitions, priority ordering, flood suppression
- Control writes: interlock validation, authorization, type checking
- Context enrichment: area/equipment/batch resolution
- ContextualRecord builder: all field combinations, edge cases

**Target:** 350+ unit tests by Phase 4 completion.

### Tier 2: Integration Tests (per phase gate)

- OPC-UA client ↔ mock OPC-UA server (opcua-asyncio server mode)
- Tag engine: Expression tag re-evaluates on dependency change, Computed tag aggregates across sources
- OPC-UA browse API → returns correct address space structure
- Tag template instantiation → creates correct child tags with resolved parameters
- forge.* SDK → real tag engine (forge.tag.read/write round-trip)
- Script trigger chain: tag change → @forge.on_tag_change script → forge.tag.write → downstream re-evaluation
- Acquisition engine → ContextualRecord → Forge Hub (gRPC)
- Acquisition engine → MQTT publisher → broker → test subscriber (verify topic, payload, QoS, retain)
- MQTT subscriber → command parser → control write queue
- Alarm engine → MQTT alarm topic + RabbitMQ → CMMS adapter → @forge.on_alarm script
- Control write → OPC-UA write → read-back confirmation → MQTT audit topic
- Full pipeline: mock PLC → Tag Engine → Scripts → ContextualRecord → Hub + MQTT + NextTrend

**Target:** 75+ integration tests. All gates require integration test passage.

### Tier 3: End-to-End / Acceptance (Phase 5–7)

- Real PLC connectivity (on-site or VPN)
- All 9 tag types working against real PLC data
- Script execution on real tag changes (converted Ignition scripts produce correct behavior)
- Dual-write data consistency (OT Module vs. Ignition bridge)
- Alarm lifecycle: trigger → acknowledge → clear cycle on real equipment
- Control write: operator action on real PLC via OT Module
- Data continuity: NextTrend trending shows no gap between Ignition and OT Module data
- Performance: 1000+ tags at <500ms latency (p95)
- Script migration parity: converted scripts produce identical outputs to Ignition Jython originals

---

## 7. Commit Strategy

- **Branch:** `reh3376_dev01` (existing dev branch pattern)
- **Commits:** Conventional format (`feat(ot):`, `fix(ot):`, `test(ot):`, `docs(ot):`)
- **PR cadence:** One PR per epic (not per sprint — epics are the atomic unit)
- **Review:** CodeRabbit + FACTS runner CI check on every PR
- **No direct commits to main** (branch-protected)

---

## 8. Verification Checklist

### Per-Sprint

- [ ] All new code has type hints (Python 3.12+ syntax)
- [ ] Ruff passes with zero warnings
- [ ] Unit tests pass (pytest -q)
- [ ] No `Any` types except in protocol boundaries
- [ ] ContextualRecords produced have all required context fields

### Per-Phase Gate

- [ ] FACTS spec passes all checks (FACTSRunner)
- [ ] Integration tests pass
- [ ] Performance benchmarks meet targets
- [ ] Documentation updated
- [ ] PLAN.md spoke table updated

### Pre-Decommission (Phase 7)

- [ ] All production areas on OT Module for ≥2 weeks
- [ ] Zero data loss confirmed (dual-write comparison report)
- [ ] Zero alarm gaps confirmed (alarm coverage comparison)
- [ ] All Ignition scripts migrated to forge.* equivalents and validated
- [ ] Operator sign-off from all shift leads
- [ ] Rollback procedure documented and tested

---

## 9. Documentation Update (Final Epic — Never Cut)

| Document | Update Required |
|----------|----------------|
| `ARCHITECTURE.md` | Add OT Module section with data flow diagrams |
| `SPOKE_ONBOARDING.md` | Update P7 status from "Not started" to completion status |
| `PLAN.md` | Update spoke table with final OT Module status |
| `CLAUDE.md` (forge) | Add OT Module CLI commands, health checks |
| `docs/p7-ot-module/` | Complete API reference, configuration guide, operator guide |
| Memory files | Update `project_ignition_scada.md`, `decision_ignition_replacement.md` |

---

## 10. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|------------|
| R1 | OPC-UA library fails on L82E firmware edge case | HIGH | MEDIUM | Phase 1 dedicated to library hardening; fallback to opcua-asyncio direct dependency if custom fork too costly |
| R2 | Control write causes equipment damage | CRITICAL | LOW | Safety interlock layer, write-back confirmation, role-based auth, phased area rollout, operator training |
| R3 | Tag path mapping errors (Ignition ↔ OPC-UA native) | MEDIUM | HIGH | Automated discovery comparison tool (Epic 5.2.3), dual-write validation |
| R4 | NextTrend data gap during migration | MEDIUM | MEDIUM | Dual-write: both Ignition→NextTrend and OT Module→NextTrend during bridge period |
| R5 | Operator resistance to change | HIGH | HIGH | OT UI Builder (P9) is separate; operators keep Ignition HMI screens until P9 delivers replacement |
| R6 | PLC network access denied (firewall/security) | HIGH | MEDIUM | Coordinate with WHK IT early; document FortiGate rule requirements in Phase 1 |
| R7 | Alarm flood on initial connection | MEDIUM | HIGH | Alarm flood suppression in Phase 3; configurable shelving on first connect |
| R8 | Performance — 1000+ tag subscription overhead | MEDIUM | MEDIUM | Batched subscription requests, connection pooling, async pipeline |
| R9 | IEC 62443 compliance gap blocks deployment | HIGH | LOW | Separate initiative; OT Module deployment on OT Servers VLAN (already segmented) |
| R10 | Scope creep — pressure to build HMI in OT Module | HIGH | HIGH | Hard boundary: P9 is the HMI. OT Module exposes API only. Document this in FACTS spec. |
| R11 | Scripting engine complexity underestimated | HIGH | MEDIUM | Phase 2B dedicated to scripting engine. Build forge.* SDK incrementally (tag, db, net first). Hot-reload simplifies iteration |
| R12 | Script sandbox bypass (security) | HIGH | LOW | Import allowlist enforced at module loader level. No raw sockets, no subprocess. RBAC checked on every forge.tag.write() |
| R13 | Jython→Python 3.12 migration gaps | MEDIUM | MEDIUM | 1,539 files but most already replaced by dedicated modules. Script migration inventory (Phase 6) identifies actual scope |
| R14 | Expression tag evaluation loop (circular dependency) | MEDIUM | MEDIUM | Dependency graph cycle detection at tag creation time. Max evaluation depth limit (default 10) |

---

## 11. Documents Accessed

| Document | Path | Purpose |
|----------|------|---------|
| P7 Research Summary | `docs/p7-ot-module/P7_RESEARCH_SUMMARY.md` | Full research findings (v2) |
| Competitive Analysis | `docs/p7-ot-module/COMPETITIVE_ANALYSIS.md` | Ignition module inventory, tag engine design, competitive landscape |
| Forge Architecture | `ARCHITECTURE.md` | Adapter tiers, OT example manifest, Ignition replacement strategy |
| Spoke Onboarding | `SPOKE_ONBOARDING.md` | P7 priority scoring, 6-phase breakdown |
| Forge Plan | `PLAN.md` | Spoke status table, test counts |
| AdapterBase model | `src/forge/core/models/adapter.py` | Interface contract |
| ContextualRecord model | `src/forge/core/models/contextual_record.py` | Record structure |
| Ignition SCADA | `/whk-ignition-scada/` | 241 views, 9 tag providers, PLC connections |
| Ignition Global | `/whk-distillery01-ignition-global/` | 57 modules, 1,539 Python files |
| MES UNS Spec | `/whk-mes/docs/features/mqtt-integration/uns-mqtt-specification.md` | MQTT integration |
| MES Changeover | `/whk-mes/docs/features/changeover/ignition-changeover-integration.md` | S88 state machine |
| NextTrend OPC-UA | `/next-trend/crates/nexttrend-ingest/src/opcua/connector.rs` | Rust OPC-UA reference |
| NextTrend Ignition Module | `/next-trend/ignition/gateway/` | Java collector/connection patterns |
| OT Architecture | `/iso-planning/10-infra-discovery/01-ot-architecture.md` | PLC inventory, network layout |
| Network Topology | `/iso-planning/10-infra-discovery/03-network-topology.md` | VLAN segmentation |
| OPC-UA/i3X Memory | `.auto-memory/reference_opcua_i3x_stack.md` | Library selection, L82E firmware |
| Ignition Replacement Decision | `.auto-memory/decision_ignition_replacement.md` | Strategic direction |
| Hardened gRPC Feedback | `.auto-memory/feedback_hardened_grpc.md` | Transport constraint |

---

## 12. Rollback Procedures

### Phase 1–4 (Pre-Bridge): No production impact (Sprints 1–16)
OT Module is not connected to production PLCs yet. Rollback is simply stopping the OT Module process.

### Phase 5–6 (Bridge Active + Script Migration): Disable bridge adapter
```bash
# Stop OT Module, Ignition continues as primary
forge module stop ot-module
# Verify Ignition still producing data
curl -s http://localhost:9999/v1/health | jq '.ot_module'
```

### Phase 7 (Area Cutover): Revert to Ignition
Per-area revert procedure:
1. Re-enable Ignition tag subscriptions for the area
2. Verify Ignition data flowing to NextTrend
3. Disable OT Module subscription for the area
4. Notify operations team of revert
5. Investigate root cause before re-attempting cutover

### Post-Decommission: Emergency Ignition Restart
Ignition `.gwbk` backup preserved. VM snapshots retained for 90 days.
```bash
# Restore Ignition VM from snapshot
# Restore .gwbk backup
# Re-enable MQTT Engine/Transmission
# Verify data flow
```

---

*This plan follows the Sprint Plan Format v1.0 (12-section standard).*
*Created: 2026-04-08 | Last Updated: 2026-04-08 (v2.0 — tag engine, scripting engine, restructured phases)*
