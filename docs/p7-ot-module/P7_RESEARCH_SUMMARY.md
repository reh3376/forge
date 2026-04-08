# P7 OT Module — Research Summary

**Date:** 2026-04-08
**Status:** Research complete, tag engine and scripting engine designed, sprint plan updated
**Author:** Forge platform team
**Classification:** STRATEGIC — Highest-stakes module in the Forge platform
**Last Updated:** 2026-04-08 (v2 — competitive analysis, tag engine, Python scripting engine)

---

## 1. Executive Summary

The OT Module (Priority 7) replaces Inductive Automation's Ignition SCADA platform with a Forge-native OT acquisition, alarming, and control system. Unlike P1–P6 (adapter wrappers around existing systems), P7 is a **new build from scratch** that directly connects to PLCs via OPC-UA and produces ContextualRecords for the Forge hub.

**Scope of replacement:**
- `whk-ignition-scada` — 241 Perspective views, 9 tag providers (18MB+ of tags), OPC-UA/MQTT/Modbus connections
- `whk-distillery01-ignition-global` — 1,539 Python files across 57 modules, CMMS middleware, MES API client, recipe/BOM management

**Target timeline:** Complete Ignition decommission by end of 2027.

---

## 2. Current State: What Ignition Does Today

### 2.1 Production Areas Controlled

| Area | Views | Key Equipment | PLC Subnet |
|------|-------|---------------|------------|
| Distillery | 30+ | Cookers (×2), fermenters, beer still, doubler, barrel fill, high wine storage | PLC200: 10.4.2.0/23 |
| Granary | 5 | Milling (×2), grain receiving, distribution | PLC100: 10.4.0.0/23 |
| Utilities | 11 | Boilers, chilled water, cooling towers, RO water, neutralization | PLC400: 10.4.6.0/23 |
| Stillage | 5 | Thick stillage, backset, loadout | PLC200: 10.4.2.0/23 |
| CIP | 5+ | Clean-in-place distribution, controls, permissives | Cross-area |
| Barreling | 8+ | Barrel scale, barrel rinser, label printers, large barrel fill | PLC300: 10.4.4.0/23 |

### 2.2 PLC Hardware

- **Primary PLCs:** 4× Allen-Bradley ControlLogix 1756-L82E (one per main process area)
- **Secondary PLCs:** 4× additional (CompactLogix/MicroLogix for RO, DA tank, etc.)
- **Remote I/O:** 48+ FLEX 5000 adapters distributed across Stratix switches
- **Instruments:** 53 instrumentation devices (flow meters, level switches, pressure sensors)
- **VFDs:** 184 variable frequency drives (QSI_PFDrive_525 UDT pattern)
- **Firmware:** v36+ (native OPC-UA on port 4840)

### 2.3 Protocols In Use

| Protocol | Current Use | OT Module Relevance |
|----------|-------------|---------------------|
| OPC-UA | Primary PLC connectivity (Ignition built-in server) | **Direct replacement** — Forge connects to PLC native OPC-UA |
| MQTT | Ignition MQTT Engine/Transmission (SparkplugB) | **OT Module becomes the new MQTT source** — replaces Ignition as publisher. Pub/sub for observability dashboards, decision systems, NextTrend, and cross-module event fan-out |
| Modbus TCP | Trane chillers (BAS/EXT/FP mode) | **Phase 2+ consideration** — secondary protocol |
| HTTP/REST | MES GraphQL, CoLOS, printer APIs | **Kept** — OT Module publishes events; MES consumes |
| FTP | Inventory CSV imports from WMS | **Replaced** — Forge adapter handles WMS data |

### 2.4 Data Flows

1. **PLC → Ignition → Canary Historian** — Real-time tag values written to CanaryHistorian via per-tag history config
2. **PLC → Ignition → MES** — ActiveOperations, ScheduleOrderActualsUpload, inventory status via GraphQL
3. **WMS → FTP → Ignition → Barreling** — CSV inventory imports, barrel serial validation, print orders
4. **CoLOS → Ignition → Orders** — Order imports from CoLOS integration endpoint
5. **Ignition → Azure Event Hub** — Cloud sync via Azure Injector module
6. **HMI → OPC-UA → PLC** — Operator control writes (motor enable, speed setpoints, valve operations)
7. **Ignition Alarms → Email pipeline** — Motor fault alarms, process alarms, multi-priority

### 2.5 MQTT/UNS Architecture (Current MES)

The MES already operates a Unified Namespace (UNS) over MQTT that the OT Module must integrate with:

**Topic namespace:** `whk/whk01/{area}/{category}/{detail}`

**Areas:** `cooker`, `fermentation`, `barreling`

**MES-published topics (retained, QoS 1):**
- `whk/whk01/{area}/changeover/state` — S88 changeover state machine
- `whk/whk01/{area}/queue/activeOrder` — Current production order
- `whk/whk01/{area}/queue/nextOrder` — Next queued order
- `whk/whk01/{area}/queue/state` — Full queue positions
- `whk/whk01/{area}/queue/depth` — Queue depth
- `whk/whk01/{area}/recipe/next` — Full recipe JSON (BOM, parameters, mashing protocols)
- `whk/whk01/{area}/recipe/updatedAt` — Recipe freshness timestamp

**Equipment-published topics (currently from Ignition, retained):**
- `whk/whk01/{area}/equipment/cipState` — CIP running/complete
- `whk/whk01/{area}/equipment/recipeLoadedConfirm` — Recipe download confirmation
- `whk/whk01/{area}/equipment/readyForProduction` — Ready signal
- `whk/whk01/{area}/equipment/mode` — Operating mode
- `whk/whk01/{area}/equipment/faultActive` — Fault status

**Domain event topics (configurable, QoS 1, retain=false):**
- `whk/mes/{area}/scheduleorder/{eventType}` — Schedule order events
- `whk/mes/{area}/deviation/{severity}/{batchId}` — Batch deviations
- `whk/mes/{area}/{asset}/event/{eventType}` — Production events

**Key design facts:**
- Plain JSON payloads (not SparkplugB)
- All topic templates are database-driven (`MqttEventPublishRule` table)
- MES supports multi-broker configuration
- Broker: RabbitMQ with MQTT plugin on LDKRVM01 (10.4.8.25), port 1883

**OT Module MQTT publishing design:**
The OT Module will publish **below** the existing hierarchy to avoid collisions:
- `whk/whk01/{area}/ot/tags/{tag_path}` — Real-time tag value changes
- `whk/whk01/{area}/ot/alarms/{alarm_id}` — Alarm state transitions
- `whk/whk01/{area}/ot/health/{plc_id}` — PLC connection health
- `whk/whk01/{area}/ot/writes/{tag_path}` — Control write audit events

This enables dashboard/decision systems to subscribe to `whk/whk01/+/ot/tags/#` for all areas, or `whk/whk01/#` for the complete enterprise picture.

The OT Module also takes over the equipment-published topics (`whk/whk01/{area}/equipment/*`) that Ignition currently produces, since those signals originate from PLC tag values that the OT Module will now acquire directly.

### 2.5 Tag Structure

- **WHK01.json** — 18MB, 201,895 lines. Primary facility tag tree
- **Hierarchy:** `WH > WHK01 > Distillery01 > [Unit] > [Equipment] > [Parameter]`
- **UDTs:** QSI_PFDrive_525 (VFDs), equipment-specific types, MES integration types
- **Tag path format:** `[provider]device/area/unit/parameter` (Ignition bracket notation)
- **Normalized path:** `WH/WHK01/Distillery01/Utility01/Neutralization01/Instrumentation/Analog/LIT_6050B/Out_PV`

### 2.6 Ignition Global Middleware (57 Modules)

Key capabilities that MUST be accounted for (but NOT all go into OT Module):

| Capability | Current Location | Replacement Target |
|------------|-----------------|-------------------|
| CMMS (work orders, equipment, inventory) | `exchange/cmms/` (8 DB tables, 100+ files) | **whk-cmms NestJS app** (already exists, P2) |
| MES API client | `mes_api_client/` (1,007 model files) | **whk-mes** (already exists) |
| Recipe/BOM management | `RecipeManagement/`, `RecipeBOM/` | **whk-mes recipe module** |
| Mashing protocols | `MashingProtocol/` | **whk-mes** |
| Barrel printing | `barrel_printing/` | **whk-wms printer-automation** |
| CSV import | `CSVImportScript01/` | **whk-wms sync** |
| GraphQL client | `core/networking/graphql/` | **OT Module context enrichment** |

**Critical finding:** Most Ignition Global capabilities are already being replaced by dedicated Forge spoke modules. The OT Module only needs to replace the **tag acquisition, alarming, and control write** functions.

---

## 3. OT Network Infrastructure

### 3.1 Network Topology

| VLAN | Subnet | Purpose | Zone |
|------|--------|---------|------|
| 1501 | 10.4.0.0/23 | PLC100 (Grain/Milling/Mashing) | OT |
| 1502 | 10.4.2.0/23 | PLC200 (Fermentation/Distillation) | OT |
| 1503 | 10.4.4.0/23 | PLC300 (Barrel/Aging/Warehousing) | OT |
| 1504 | 10.4.6.0/23 | PLC400 (Utilities/Water/Trucks) | OT |
| 1505 | 10.4.8.0/23 | OT Servers (Ignition VMs, historians) | OT |
| 1506 | 10.4.10.0/23 | PLC500 (MAC/Warehouse) | OT |
| 100 | 10.0.0.0/24 | Management (network devices) | Management VRF |

### 3.2 Security

- **FortiGate-600F HA pair** (EFWMDF000-01/02) with OT zone enforcement
- **148 Stratix/OT industrial switches** (Hirschmann/Phoenix Contact)
- **Gap:** OT-Detect/OT-Patch licenses NOT active — no ICS/SCADA protocol analysis
- **Gap:** IEC 62443 compliance not yet addressed

### 3.3 Ignition SCADA Infrastructure

- **Active:** WIGNVM01 (primary VM)
- **Passive:** WIGNVM04 (failover)
- **Network:** 10.4.8.x (OT Servers VLAN)
- **Services:** OPC-UA server, MQTT Engine, MQTT Transmission, Azure Injector

---

## 4. Cross-Module Dependencies

### 4.1 MES ↔ OT Integration (Current)

The MES already has sophisticated MQTT/UNS integration:

- **Inbound (Equipment → MES):** MqttService subscribes to UNS broker, persists to MqttMessage table (30-day TTL), emits to WebSocket gateway
- **Outbound (MES → Equipment):** MqttDomainPublisherService publishes domain events (ScheduleOrder, BatchDeviation, ProductionEvent, StepExecution) with rule-based topic routing
- **Changeover state machine:** S88-compliant 9-state machine (PRODUCTION → COOK_COMPLETE → AWAITING_CHANGEOVER → CIP_IN_PROGRESS → CIP_COMPLETE → RECIPE_LOADING → RECIPE_LOADED → READY_TO_START → PRODUCTION)
- **Recipe delivery:** Full recipe JSON published to `whk/whk01/{area}/recipe/next` on CIP complete
- **Optimistic concurrency:** Equipment includes `sourceUpdatedAt` when confirming recipe load (409 on mismatch)

**Impact on OT Module:** The OT Module must integrate with MES's existing MQTT topic hierarchy:
1. **Publish real-time tag values** to `whk/whk01/{area}/ot/tags/#` (new, enables observability dashboards and decision systems)
2. **Take over equipment status topics** (`whk/whk01/{area}/equipment/*`) that Ignition currently publishes
3. **Subscribe to recipe/changeover topics** to receive MES commands and apply them via OPC-UA writes to PLCs
4. **Eventually provide a direct OPC-UA-based recipe download path** (Phase 4, replaces MQTT recipe flow)

### 4.2 NextTrend Historian ↔ OT

NextTrend already supports three OT ingestion paths:

1. **MQTT connector** (rumqttc) — JSON/raw payloads, topic-to-tag mapping
2. **SparkplugB connector** (srad library) — Structured BIRTH/DATA/DEATH
3. **OPC-UA connector** (opcua Rust crate) — Subscription or polling mode

Plus the Ignition module (Java OSGi):
- NextTrendCollector: Pattern-based bulk tag subscription
- NextTrendStorageEngine: Per-tag historian extension point
- NextTrendConnection: Health-checked REST client to NextTrend API

**Impact on OT Module:** The OT Module publishes to NextTrend via three complementary paths:
- **MQTT** (primary for real-time) — OT Module publishes tag values to `whk/whk01/{area}/ot/tags/#`; NextTrend's MQTT connector subscribes and ingests. Zero coupling between the two systems.
- **REST API** (batch write for backfill) — Historical data or batch uploads via NextTrend's `/api/v1/tags/values` endpoint
- **SparkplugB** (optional) — OT Module can encode SparkplugB BIRTH/DATA/DEATH for NextTrend's SparkplugB connector, giving structured metadata (data type, engineering units) alongside values
- The Ignition bridge period uses the existing Ignition→NextTrend path as fallback

### 4.3 CMMS ↔ OT

Currently **no direct OT integration.** CMMS has:
- Asset registry (equipment hierarchy, serial numbers, suppliers)
- Work orders (manual creation only)
- No MQTT alarm ingestion
- No auto-work-order from equipment faults

**Impact on OT Module:** Major opportunity. OT Module alarm events → CMMS work order creation (via RabbitMQ). This is a new integration that doesn't exist today.

### 4.4 WMS ↔ OT

Limited to:
- Barcode scanning (mobile devices, manual)
- Barrel serial validation (CSV import via FTP)
- No conveyor integration, no automated material handling

**Impact on OT Module:** Low priority for P7. WMS integration remains unchanged during initial OT Module build.

---

## 5. Governance Requirements

### 5.1 FACTS Specification

The OT Module requires a FACTS spec (`ot-module.facts.json`) with:
- `adapter_tier`: OT
- `capabilities`: read, write, subscribe, backfill, discover
- `auth_methods`: certificate, api_key, none
- `source_types`: grpc_unary, grpc_server_stream (hub transport), mqtt (pub/sub fan-out), websocket (future i3X SSE)
- `context_fields` (required): equipment_id, area, site, tag_path, engineering_units, quality, operating_mode
- `context_fields` (optional): batch_id, lot_id, recipe_id, shift, operator_id
- `data_sources`: tag_subscription (OPC-UA → records), tag_publish (records → MQTT), alarm_publish (alarms → MQTT), health_publish (status → MQTT), command_subscribe (MQTT → OPC-UA writes)

### 5.2 FTTS Transport

- Hub↔module uses compiled protobuf binary (never JSON-over-gRPC)
- Governed by `grpc-hardened-transport.ftts.json`
- Must support high-frequency data (ms-to-sec intervals, potentially thousands of tags)

### 5.3 Quality and Safety

- OPC-UA quality codes: GOOD (192), UNCERTAIN (64), BAD (0) → mapped to Forge QualityCode enum
- Control writes MUST have safety interlocks and full audit trail
- ISA-18.2 alarm state machine for alarm management
- ISA-88 (S88) batch model for changeover integration

---

## 6. Technical Architecture Decision

### 6.1 What the OT Module IS

```
forge/
  sdk/                               <- EXISTING Forge Module SDK (extended, not replaced)
    __init__.py                      <- "Forge SDK — libraries and tools for building Forge modules"
    module_builder/                  <- EXISTING — ManifestBuilder, ModuleScaffolder
    scripting/                       <- NEW — Python 3.12+ scripting runtime (replaces Ignition Jython 2.7)
      engine.py                      <- ScriptEngine: discover, register, hot-reload
      sandbox.py                     <- Import allowlist, resource limits, RBAC enforcement
      triggers.py                    <- Decorator registry (on_tag_change, timer, on_event, on_alarm)
      modules/                       <- forge.* SDK namespace implementations
        tag.py                       <- forge.tag (read, write, browse, get_config)
        db.py                        <- forge.db (query, named_query, transaction)
        net.py                       <- forge.net (http_get, http_post, etc.)
        log.py                       <- forge.log (structured logging)
        alarm.py                     <- forge.alarm (ISA-18.2 state-aware ops)
        api.py                       <- forge.api (REST endpoint registration, FastAPI-backed)

  modules/
    ot/
      opcua_client/                  <- Hardened OPC-UA Python library (forked from opcua-asyncio)
      tag_engine/                    <- 9-type tag engine
        engine.py                    <- TagEngine: registry, evaluation loop, dependency tracking
        types.py                     <- Tag type definitions (StandardTag, MemoryTag, etc.)
        providers/                   <- Tag providers (OpcUaProvider, MemoryProvider, etc.)
        templates.py                 <- Tag templates (UDT equivalent with parameter inheritance)
        store_forward.py             <- Store-and-forward buffer for connectivity loss
      i3x/                           <- i3X-compliant REST API (CESMII spec adapted to FxTS)
        namespaces.py                <- /namespaces endpoint (PLC connections as i3X namespaces)
        object_types.py              <- /objecttypes endpoint (equipment types from address space)
        objects.py                   <- /objects endpoint (browse, values, history)
        subscriptions.py             <- /subscriptions SSE endpoint (real-time value streaming)
      acquisition/                   <- Tag subscription engine (multi-PLC, event-driven)
      mqtt/                          <- MQTT pub/sub engine
        publisher.py                 <- Tag value + alarm + health publishing to UNS topics
        subscriber.py                <- MES recipe/changeover command ingestion
        topic_router.py              <- Topic template resolution (whk/whk01/{area}/ot/...)
        sparkplug.py                 <- Optional SparkplugB encoding for industrial consumers
      alarming/                      <- ISA-18.2 alarm state machine
      control/                       <- Write interface with safety interlocks
      context/                       <- Context enrichment (equipment_id -> area, batch_id, etc.)
      scripts/                       <- User scripts directory (hot-reloaded by forge.sdk.scripting)
        tag_change/                  <- @forge.on_tag_change handlers
        timers/                      <- @forge.timer handlers
        events/                      <- @forge.on_event handlers
        api/                         <- @forge.api.route handlers
        alarms/                      <- @forge.on_alarm handlers
        lib/                         <- Shared utility modules
      adapter.py                     <- Forge AdapterBase + SubscriptionProvider + WritableAdapter + DiscoveryProvider
      manifest.json                  <- Forge adapter manifest
      facts_spec.json                <- FACTS governance specification
```

### 6.2 What the OT Module is NOT

- NOT the HMI/UI (that's P9 — OT UI Builder)
- NOT the CMMS (that's whk-cmms, already P2)
- NOT the historian (that's NextTrend)
- NOT the MES recipe engine (that's whk-mes)
- NOT a wrapper around Ignition (Ignition bridge is a temporary migration shim, not the module itself)

### 6.3 Data Path (Target Architecture)

```
PLC (ControlLogix L82E/L83, OPC-UA server port 4840)
  → Forge OPC-UA client (hardened Python asyncio library)
    → OT Module acquisition engine (subscription-based)
      → Context enrichment (equipment → area, batch, recipe)
        → ContextualRecord creation
          ├─→ Forge Hub (gRPC protobuf binary)
          │     → Data Router → NextTrend, MES, CMMS, NMS
          ├─→ MQTT publisher (JSON + optional SparkplugB)
          │     → whk/whk01/{area}/ot/tags/{path} (real-time values)
          │     → whk/whk01/{area}/ot/alarms/{id} (alarm state)
          │     → whk/whk01/{area}/ot/health/{plc} (connection health)
          │     → whk/whk01/{area}/equipment/* (takeover from Ignition)
          │     → Consumers: dashboards, decision systems, NextTrend MQTT connector
          ├─→ RabbitMQ (structured events for cross-module workflows)
          └─→ Alarm engine (ISA-18.2 state tracking)

MQTT subscriber (inbound):
  ← whk/whk01/{area}/recipe/next (MES recipe delivery)
  ← whk/whk01/{area}/changeover/state (MES changeover commands)
    → OT Module translates to OPC-UA writes to PLC
```

The OT Module acts as a **protocol bridge**: OPC-UA in (from PLCs) → enriched ContextualRecords → MQTT out (to any consumer). This gives observability dashboards, decision-support agents, and monitoring systems a decoupled subscription interface without requiring direct OPC-UA sessions or coupling to the Forge Hub API.

---

## 7. Competitive Analysis Summary

Full analysis in `COMPETITIVE_ANALYSIS.md`. Key findings:

### 7.1 Ignition Is an 11-Module Platform

Ignition is not a single product — it's a platform with Tag System, Perspective, Vision, Tag Historian, SQL Bridge, Alarm Notification, Reporting, SFC, WebDev, EAM, and Gateway Network. Plus third-party modules from Sepasoft (Batch, OEE, Track & Trace) and Cirrus Link (MQTT Engine/Transmission/Distributor).

**Forge's response:** Most Ignition modules map to existing or planned Forge modules. The OT Module specifically replaces: Tag System, SQL Bridge, Alarm Notification, WebDev, and the Cirrus Link MQTT stack. Perspective/Vision → P9 OT UI Builder. Tag Historian → NextTrend. Batch → whk-mes. EAM → Forge Hub. Gateway Network → gRPC transport.

### 7.2 Ignition's Weaknesses (Forge Advantages)

| # | Ignition Weakness | Forge Advantage |
|---|------------------|-----------------|
| 1 | **Jython 2.7 scripting** — Python 2.7, no async, no type hints, no modern ecosystem | **Python 3.12+ scripting** — async, type-safe, full pip ecosystem, UV/Ruff toolchain |
| 2 | No spec governance — GUI-configured, not version-controlled (until 8.3) | **FACTS spec** — machine-readable, CI-enforced, version-controlled from day one |
| 3 | Gateway-centric — single process bottleneck | **Distributed** — independent PLC connections, hub aggregates but doesn't bottleneck |
| 4 | No context enrichment — only value + quality + timestamp | **ContextualRecord** — equipment_id, area, batch_id, recipe_id, operating_mode |
| 5 | Closed module ecosystem — proprietary, expensive third-party modules | **Open architecture** — any Python package, governed by FACTS |
| 6 | No built-in MQTT publishing — requires Cirrus Link ($4,000+ add-on) | **Built-in MQTT pub/sub** — first-class, no add-on |
| 7 | Basic alarm notifications — email, SMS, voice only | **Pluggable notification** — MQTT, RabbitMQ, webhook, Slack, Teams, email, custom |
| 8 | No AI/ML integration | **Forge AI agents** consume ContextualRecords natively |
| 9 | Scaling requires more gateways + per-server licensing | **Horizontal scaling** — no licensing cost, add instances |
| 10 | Coarse security — system-level permissions, CISA advisory on script sandbox | **Fine-grained RBAC** — per-tag, per-area, sandboxed script execution |

### 7.3 Competitive Landscape

| Platform | Licensing | Tag Types | Scripting | Key Weakness |
|----------|-----------|-----------|-----------|--------------|
| **Ignition** ($7.5K/server) | Unlimited tags | 6 + UDTs | Jython 2.7 | Python 2, no governance |
| **AVEVA** ($25K+) | Tag-based | ArchestrA objects | VBScript/C# | Expensive, vendor-locked |
| **Siemens WinCC** ($15K+) | Tag-based | WinCC + PLC types | VBScript/C++ | TIA Portal lock-in |
| **GE iFIX** ($18K+) | Tag-based | Tag groups | VBA | Legacy, limited web |
| **Forge OT Module** (open) | Unlimited | **9 types + Templates** | **Python 3.12+** | New (unproven) |

---

## 8. Tag Engine Design

Based on competitive analysis, the Forge OT Module implements a **9-type tag engine** that exceeds Ignition's 6-type system with 3 Forge-exclusive types.

### 8.1 Tag Types (9 Types)

| # | Tag Type | Source | Update Trigger | Ignition Equiv |
|---|----------|--------|---------------|----------------|
| 1 | **Standard (OPC)** | OPC-UA node on PLC | Subscription data change | OPC Tag |
| 2 | **Memory** | None (user-set) | Explicit write (API, script, MQTT) | Memory Tag |
| 3 | **Expression** | Python expression referencing other tags | Dependency change | Expression Tag |
| 4 | **Query** | SQL query against any configured DB | Configurable poll interval | Query Tag |
| 5 | **Derived** | Source tag + read/write transform expressions | Source tag change | Derived Tag |
| 6 | **Reference** | Alias to another tag | Source tag change | Reference Tag |
| 7 | **Computed** ★ | Multi-source aggregation (avg, sum, min, max across tag set) | Any source change | **No equiv** |
| 8 | **Event** ★ | External event (MQTT message, RabbitMQ, webhook) | Event arrival | **No equiv** |
| 9 | **Virtual** ★ | External data source (NextTrend, REST API, external DB) | Poll or on-demand | **No equiv** |

★ = Forge-exclusive tag types

### 8.2 Tag Templates (Replaces Ignition UDTs)

Parameterized templates with inheritance, alarm configs, and history configs. Changes propagate to all instances. Example:

```
Template: VFD_Drive
  Parameters:
    plc_connection: str       # Which PLC
    base_path: str            # OPC-UA base node path
    equipment_id: str         # CMMS asset reference
    area: str                 # Production area

  Tags:
    speed_feedback:  Standard Tag -> {plc_connection}/{base_path}/HMI_FeedbackSpeed
    output_current:  Standard Tag -> {plc_connection}/{base_path}/HMI_OutputCurrent
    motor_enable:    Standard Tag -> {plc_connection}/{base_path}/HMI_MO  (writable)
    is_running:      Expression Tag -> speed_feedback > 0.5
    efficiency:      Computed Tag  -> (speed_feedback / speed_setpoint) * 100
    fault_active:    Derived Tag   -> alarm_status, read_expr="bool(value & 0x01)"

  Alarms:
    overcurrent: threshold on output_current, priority=HIGH, setpoint=150.0
    stall:       threshold on speed_feedback, priority=CRITICAL, setpoint=0.0, delay=5s

  History:
    speed_feedback:  sample_mode=on_change, deadband=0.5, publish_to=[nexttrend, mqtt]
    output_current:  sample_mode=periodic, interval=5s, publish_to=[nexttrend]
```

### 8.3 Tag Provider Architecture

```
Tag Engine
+-- OPC-UA Provider (per PLC connection)
|   +-- plc100/ (Grain/Milling)
|   +-- plc200/ (Fermentation/Distillation)
|   +-- plc300/ (Barrel/Aging)
|   +-- plc400/ (Utilities)
+-- Memory Provider
+-- Expression Provider
+-- Query Provider
+-- Event Provider (MQTT/RabbitMQ/webhook triggers)
+-- Virtual Provider (NextTrend/external DB/REST API)
```

### 8.4 OPC-UA Address Space Exposure (i3X-Compliant)

The OT Module exposes the full PLC tag structure via a REST API modeled on the **CESMII i3X specification** (https://github.com/cesmii/i3X). Rather than inventing a custom browse API from scratch, we adopt the i3X data model (Namespace → ObjectType → ObjectInstance → Values + History + Subscriptions) and adapt it to the FxTS governance framework. This gives consuming applications a standards-compliant interface while the OPC-UA browse mechanics happen at the protocol layer.

**i3X-shaped endpoints (adapted to Forge FxTS):**

1. **Namespaces** — `GET /api/v1/ot/namespaces` → list PLC connections as i3X namespaces (plc100, plc200, etc.)
2. **Object Types** — `GET /api/v1/ot/objecttypes?namespace=plc200` → equipment types from address space (e.g., VFD_Drive, AnalogInstrument)
3. **Browse/Objects** — `GET /api/v1/ot/objects?namespace=plc200&path=Fermentation/` → child nodes, data types, access levels (i3X object instances)
4. **Values** — `GET /api/v1/ot/objects/value?path=...` → live value preview without creating subscription
5. **History** — `GET /api/v1/ot/objects/history?path=...&start=...&end=...` → historical values (delegated to NextTrend)
6. **Subscriptions** — `GET /api/v1/ot/subscriptions` (SSE) → real-time value streaming for consuming apps

**Additional Forge-specific capabilities:**
- **Tag Discovery** — `POST /api/v1/ot/discover?namespace=plc200&recursive=true` → auto-creates tag definitions from PLC address space
- **Address Space Cache** — Cached browse results per PLC connection, configurable refresh interval (default 5min)
- **Drag-and-Drop Tag Creation** — Browse → select → create tags (future, for P9 OT UI Builder)

**Why i3X:** CESMII's i3X spec is the emerging standard for industrial data access (Alpha, targeting 1.0 in 2026). By building the OT Module's browse/discovery API on this foundation, we get: (a) a well-structured data model we don't have to invent, (b) compatibility with any i3X consumer as the ecosystem grows, and (c) a clean separation between the OPC-UA protocol layer and the REST API layer that consuming apps see.

---

## 9. Python Scripting Engine Design

### 9.1 Strategic Decision: Python 3.12+ as Scripting Language

Ignition uses Jython 2.7 as its scripting language — a JVM-based Python 2.7 implementation. This is universally recognized as Ignition's single biggest weakness: no async/await, no type hints, no f-strings, no modern libraries, no pip. The CISA advisory on Ignition specifically flagged unrestricted Python script imports as a security concern.

**The Forge OT Module uses Python 3.12+ as its user-facing scripting language**, providing the same script trigger points as Ignition but with modern Python, sandboxed execution, and the full `forge.*` SDK namespace.

If we built nothing else — just cloned Ignition's functionality with Python 3.12+ instead of Jython 2.7 — that single change would make the Forge OT Module valuable enough to compete.

### 9.1.1 Integration with Existing Forge Module SDK

The scripting engine is NOT a standalone framework — it extends the **existing Forge module SDK** (`forge.sdk`). The SDK already provides:

- `forge.sdk.module_builder` — ManifestBuilder, ModuleScaffolder, 6-file adapter pattern generators
- `forge.adapters.base.interface` — AdapterBase, SubscriptionProvider, WritableAdapter, BackfillProvider, DiscoveryProvider

The scripting engine adds a new sibling sub-package:

```
forge/
  sdk/
    __init__.py                    # "Forge SDK — libraries and tools for building Forge modules"
    module_builder/                # EXISTING — adapter scaffolding
      manifest_builder.py
      scaffolder.py
      generators.py
      cli.py
    scripting/                     # NEW — Python 3.12+ scripting runtime
      engine.py                    # ScriptEngine: discover, register, hot-reload
      sandbox.py                   # Import allowlist, resource limits, RBAC
      triggers.py                  # Decorator registry (@forge.on_tag_change, etc.)
      modules/                     # forge.* SDK namespace implementations
        tag.py                     # forge.tag (read, write, browse, get_config)
        db.py                      # forge.db (query, named_query, transaction)
        net.py                     # forge.net (http_get, http_post, etc.)
        log.py                     # forge.log (structured logging)
        alarm.py                   # forge.alarm (ISA-18.2 state-aware ops)
        api.py                     # forge.api (REST endpoint registration)
```

This keeps the scripting engine as part of the SDK rather than a separate system, and means any Forge module (not just OT) could eventually use the scripting framework — though OT is the primary consumer for P7.

The `forge.tag` SDK module connects directly to the tag engine via the existing `SubscriptionProvider` and `WritableAdapter` interfaces from `AdapterBase`. The `forge.db` module leverages the same connection pooling infrastructure available to all adapters. This avoids creating parallel infrastructure.

### 9.2 Ignition Script System (What We Replace)

Analysis of WHK's Ignition codebases (1,539 Python files, 585+ `system.*` call sites) reveals 7 script categories:

| Script Type | Ignition Mechanism | Forge Equivalent |
|-------------|-------------------|-----------------|
| **Tag Change Scripts** | Gateway event on tag value change | `@forge.on_tag_change("path/*")` decorator |
| **Timer Scripts** | Periodic execution (1s, 5s, 60s) | `@forge.timer(interval="5s")` decorator |
| **Gateway Event Scripts** | System lifecycle (startup, shutdown) | `@forge.on_event("startup")` decorator |
| **Expression Scripts** | Inline Python in Expression tags | Expression Tag engine (built-in) |
| **WebDev Endpoints** | `doGet(request, session)` / `doPost(request, session)` | `@forge.api.route("/path", methods=["GET"])` — FastAPI-backed |
| **Project Scripts** | Library functions imported across scripts | Standard Python packages in `scripts/` directory |
| **Alarm Pipeline Scripts** | Custom logic in alarm notification pipelines | `@forge.on_alarm(priority="CRITICAL")` decorator |

### 9.3 The `forge.*` SDK Namespace

Replaces Ignition's `system.*` namespace with modern Python 3.12+ equivalents:

| Ignition Module | Forge Module | Key Differences |
|----------------|-------------|-----------------|
| `system.tag.readBlocking()` | `forge.tag.read("path")` | Async: `await forge.tag.read("path")`, returns typed `TagValue` |
| `system.tag.writeBlocking()` | `forge.tag.write("path", value)` | Async, interlock-checked, audit-logged automatically |
| `system.tag.browse()` | `forge.tag.browse("path")` | Returns typed `BrowseResult` with OPC-UA metadata |
| `system.tag.getConfiguration()` | `forge.tag.get_config("path")` | Returns Pydantic model, not Java object |
| `system.db.runPrepQuery()` | `forge.db.query(sql, params, db="name")` | Async, parameterized, connection-pooled |
| `system.db.runNamedQuery()` | `forge.db.named_query("name", params)` | Async, registered SQL with schema validation |
| `system.db.beginTransaction()` | `async with forge.db.transaction("db") as tx:` | Context manager, auto-commit/rollback |
| `system.net.httpGet()` | `forge.net.http_get(url)` | Async, returns typed response, timeout/retry built-in |
| `system.net.httpPost()` | `forge.net.http_post(url, json=data)` | Async, JSON-native |
| `system.util.getLogger()` | `forge.log.get("name")` | Structured logging (JSON), correlated with request context |
| `system.util.jsonEncode()` | Built-in `json.dumps()` | Standard Python — no wrapper needed |
| `system.alarm.*` | `forge.alarm.get_active()`, `forge.alarm.ack(id)` | ISA-18.2 state-aware, typed alarm objects |
| `system.perspective.*` | N/A (P9 — OT UI Builder SDK) | Separate module, not in OT Module scope |
| `system.dataset.*` | Standard `list[dict]` / pandas | Python-native data structures, not Java DataSet |

### 9.4 Script Trigger Points (Examples)

```python
# Tag Change Script — fires when any matching tag changes
@forge.on_tag_change("WH/WHK01/Distillery01/*/Instrumentation/Analog/*/Out_PV")
async def on_temperature_change(event: TagChangeEvent):
    if event.new_value > 180.0:
        await forge.alarm.trigger("high_temp", tag_path=event.tag_path, value=event.new_value)

# Timer Script — fires on interval
@forge.timer(interval="30s", name="batch_sync")
async def sync_batch_context():
    active_batches = await forge.net.http_get("http://mes-api:3000/graphql", json={"query": "..."})
    for batch in active_batches:
        await forge.tag.write(f"context/{batch['area']}/batch_id", batch["id"])

# Gateway Event Script — fires on lifecycle events
@forge.on_event("startup")
async def on_startup():
    await forge.log.get("ot").info("OT Module started, initializing PLC connections")

# WebDev Endpoint — REST API handler (replaces Ignition WebDev doGet/doPost)
@forge.api.route("/api/scripts/barrel-validate", methods=["POST"])
async def validate_barrel(request: forge.api.Request) -> forge.api.Response:
    serial = request.json.get("serial")
    result = await forge.db.query("SELECT * FROM barrels WHERE serial = $1", [serial], db="wms")
    return forge.api.json_response({"valid": len(result) > 0, "serial": serial})

# Alarm Pipeline Script — fires on alarm state changes
@forge.on_alarm(priority="CRITICAL", areas=["Distillery"])
async def on_critical_alarm(alarm: AlarmEvent):
    await forge.net.http_post("https://hooks.slack.com/...", json={
        "text": f"CRITICAL: {alarm.description} at {alarm.equipment_id}"
    })
```

### 9.5 Script Execution Model

| Feature | Ignition (Jython 2.7) | Forge (Python 3.12+) |
|---------|----------------------|---------------------|
| **Execution** | Synchronous, blocks gateway thread | **Async** — asyncio event loop, non-blocking |
| **Isolation** | Shared JVM classloader, no sandboxing | **Sandboxed** — restricted imports, resource limits, timeout enforcement |
| **Type Safety** | None (dynamic Python 2) | **Full type hints** + runtime validation via Pydantic |
| **Error Handling** | Java exceptions leak into Python | **Native Python exceptions** with structured logging |
| **Dependencies** | Limited to JVM classpath | **Any pip package** (managed via UV, allowlisted per-script) |
| **Testing** | No built-in test framework | **pytest** — scripts testable outside the runtime |
| **Hot Reload** | Requires gateway restart for project scripts | **Hot reload** — file watch detects changes, re-registers handlers |
| **Version Control** | GUI export only (until 8.3 JSON-as-Code) | **Git-native** — scripts are .py files in the module directory |

### 9.6 Script Security Model

- **Import allowlist:** Scripts can only import approved modules (forge.*, standard library, allowlisted pip packages). No direct process spawning, no raw sockets (use `forge.net.*` instead).
- **Resource limits:** Per-script CPU time limit (default 5s), memory limit (default 256MB), concurrent execution limit.
- **RBAC integration:** Scripts execute with the permissions of their registered owner (OPERATOR, ENGINEER, ADMIN). Write operations in scripts check tag-level RBAC.
- **Audit trail:** Every `forge.tag.write()` and `forge.db.query()` call is logged with the script name, trigger event, and executing user.

### 9.7 Script Organization

User scripts live in the OT Module's `scripts/` directory and are discovered/executed by the `forge.sdk.scripting.ScriptEngine`. Because the scripting runtime is part of the Forge SDK (not OT-specific), any future module could also host scripts — but OT is the primary consumer.

```
forge/modules/ot/
  scripts/                         # Discovered and managed by forge.sdk.scripting.ScriptEngine
    tag_change/                    # @forge.on_tag_change handlers
      temperature_alerts.py
      vfd_fault_detection.py
    timers/                        # @forge.timer handlers
      batch_context_sync.py
      equipment_health_poll.py
    events/                        # @forge.on_event handlers
      startup.py
      plc_connection.py
    api/                           # @forge.api.route handlers (FastAPI-backed)
      barrel_validate.py
      recipe_status.py
    alarms/                        # @forge.on_alarm handlers
      critical_notifications.py
      cmms_work_order.py
    lib/                           # Shared utility modules (importable by scripts)
      mes_client.py
      formatting.py
```

The `forge.sdk.scripting` engine handles: decorator discovery, handler registration, hot-reload via file watching, sandbox enforcement, and execution scheduling. The `forge.tag` / `forge.db` / `forge.net` SDK modules connect back to the tag engine and adapter infrastructure through the same interfaces (`SubscriptionProvider`, `WritableAdapter`, `DiscoveryProvider`) that the hub uses.

---

## 10. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| OPC-UA library instability with L82E firmware | HIGH | MEDIUM | Phase 1 is dedicated to library hardening + L82E testing |
| Control write causes equipment damage | CRITICAL | LOW | Safety interlock layer, audit trail, role-based auth, phased rollout by area |
| Ignition decommission too aggressive | HIGH | MEDIUM | Ignition bridge adapter allows parallel operation |
| Tag structure mismatch (Ignition ↔ OPC-UA native) | MEDIUM | HIGH | Tag mapping phase with automated discovery |
| NextTrend data gap during transition | MEDIUM | MEDIUM | Dual-write: both Ignition→NextTrend and OT Module→NextTrend during bridge period |
| Operator resistance to new HMI | HIGH | HIGH | P9 (OT UI Builder) is separate and later; operators keep Ignition screens during OT Module build |
| Network security (IEC 62443) gaps | HIGH | HIGH | FortiGate OT license activation, zone enforcement hardening |
| Scripting engine complexity underestimated | HIGH | MEDIUM | Phase 2B dedicated to scripting engine; `forge.*` SDK designed incrementally (tag, db, net modules first) |
| Script security sandbox bypass | HIGH | LOW | Import allowlist, resource limits, no raw process/socket access, RBAC-integrated execution |

---

## 11. Key Numbers

| Metric | Value |
|--------|-------|
| Ignition Perspective views to replace | 241 |
| Python/Jython files in Ignition Global | 1,539 |
| Tag providers in Ignition | 9 |
| Tag lines (WHK01.json alone) | 201,895 |
| PLCs (primary) | 4 |
| PLCs (secondary) | 4 |
| Remote I/O adapters | 48+ |
| VFDs | 184 |
| Instruments | 53 |
| OT network devices | 806 |
| OT industrial switches | 148 |
| Canary historian tags | 14,000+ |
| MES MQTT publish rules | Rule-based (dynamic) |
| MES changeover states | 9 (S88 compliant) |

---

## 12. Implementation Phase Breakdown (Preliminary)

### Phase 1: OPC-UA Library Hardening (Sprints 1–3)
- Fork opcua-asyncio as reference (not direct dependency)
- Build hardened async Python OPC-UA client
- Required: subscribe, browse, read, write, history, auto-reconnect, TLS/certificate auth
- Test against L82E v36+ firmware on WHK OT network
- **Gate:** Library passes conformance tests against real PLCs

### Phase 2A: Tag Engine & Acquisition (Sprints 4–7)
- 9-type tag engine (Standard, Memory, Expression, Query, Derived, Reference, Computed, Event, Virtual)
- Tag template system (UDT equivalent with parameter inheritance)
- Tag providers (OPC-UA, Memory, Expression, Query, Event, Virtual)
- OPC-UA address space browse/discovery API
- Multi-PLC connection management with subscription orchestration
- Context enrichment (equipment_id, area, batch_id, recipe_id)
- ContextualRecord production from all tag types
- Store-and-forward buffering for connectivity loss
- **Gate:** All 9 tag types functional, 100+ tags streaming, OPC-UA browse API working

### Phase 2B: Python Scripting Engine & MQTT (Sprints 8–10)
- `forge.*` SDK namespace (forge.tag, forge.db, forge.net, forge.log, forge.alarm)
- Script trigger points: @forge.on_tag_change, @forge.timer, @forge.on_event, @forge.api.route, @forge.on_alarm
- Sandboxed execution with import allowlist, resource limits, RBAC integration
- Script hot-reload and file-watch registration
- MQTT pub/sub engine (tag value publishing, alarm broadcasting, MES command subscription)
- SQL Bridge equivalent (bidirectional DB ↔ tag sync via Query tags + scripts)
- **Gate:** forge.* SDK functional, scripts testable via pytest, MQTT fan-out working

### Phase 3: Alarm Engine (Sprints 11–13)
- ISA-18.2 alarm state machine implementation
- Alarm priorities, acknowledgment, suppression, shelving
- Alarm → CMMS work order integration (RabbitMQ event)
- Alarm → NextTrend annotation, Alarm → MQTT topic publishing
- Alarm pipeline scripts via @forge.on_alarm
- **Gate:** Alarm lifecycle tests pass, CMMS receives work order events

### Phase 4: Control Write Interface (Sprints 14–16)
- Write-with-interlock pattern (safety checks before any write)
- Role-based authorization for writes
- Full audit trail (who wrote what, when, from where)
- MES recipe write integration (MQTT → OPC-UA bridge)
- **Gate:** Control writes execute safely on test PLC, audit trail complete

### Phase 5: Ignition Bridge Adapter (Sprints 17–18)
- Temporary adapter that reads from Ignition REST endpoints
- Maps Ignition tag values to Forge ContextualRecords
- Allows parallel operation during migration
- **Gate:** Forge receives data from both Ignition bridge AND direct OPC-UA

### Phase 6: Script Migration (Sprints 19–20)
- Inventory Ignition Jython scripts, identify migration scope (most already replaced by dedicated modules)
- Convert system.* to forge.* SDK, add async/type hints
- Convert WebDev endpoints to @forge.api.route handlers
- Side-by-side validation of converted scripts
- **Gate:** All required scripts converted and validated via pytest

### Phase 7: Progressive Ignition Decommission (Sprints 21+)
- Area-by-area cutover: Distillery → Granary → Stillage → CIP → Utilities
- Validation gate per area before moving to next
- Dual-write period with data comparison
- **Gate:** Zero data loss, zero alarm gaps, all scripts migrated, operators signed off

---

## 13. Open Questions for Sprint Planning

1. **Deployment model:** On-premise Docker container? Edge gateway? Both?
2. **Certificate management:** Internal PKI or third-party CA for OPC-UA TLS?
3. **Tag retention policy:** How much L83 history to backfill into NextTrend?
4. **Alarm notification routing:** Email? SMS? Mobile push? Web dashboard?
5. **Safety interlock validation:** Requires WHK safety team sign-off — when?
6. **IEC 62443 compliance scope:** Is this P7 or separate initiative?
7. **Modbus TCP timeline:** Trane chillers need Modbus — Phase 2 or deferred?
8. **CoLOS integration:** Order imports currently via Ignition — alternative path needed?
9. **Azure Event Hub:** Does cloud sync continue? Via OT Module or separate?
10. **Test PLC availability:** Can we get a dedicated test L82E for development?

---

## 14. Files Referenced

### P7 Planning Documents
- `docs/p7-ot-module/COMPETITIVE_ANALYSIS.md` — Full competitive analysis, Ignition module inventory, tag engine design
- `docs/p7-ot-module/P7_SPRINT_PLAN.md` — Sprint development plan (v2.0, 7 phases, 22+ sprints)

### Existing Forge Infrastructure
- `src/forge/adapters/opcua/__init__.py` — Empty stub (to be built)
- `src/forge/adapters/mqtt_sparkplug/__init__.py` — Empty stub
- `src/forge/core/models/adapter.py` — AdapterBase, AdapterTier, AdapterState
- `src/forge/core/models/contextual_record.py` — ContextualRecord, RecordSource, RecordValue, etc.
- `ARCHITECTURE.md` — Adapter tiers, OPC-UA generic example manifest
- `SPOKE_ONBOARDING.md` — P7 definition, 6 implementation phases
- `PLAN.md` — Spoke onboarding status table

### Ignition Codebases
- `/whk-ignition-scada/` — 241 views, 9 tag providers, 6 Python modules
- `/whk-distillery01-ignition-global/` — 1,539 Python files, 57 modules

### Cross-Module Integration
- `/whk-mes/docs/features/mqtt-integration/uns-mqtt-specification.md` — MES UNS architecture
- `/whk-mes/docs/features/changeover/ignition-changeover-integration.md` — S88 changeover
- `/next-trend/crates/nexttrend-ingest/src/opcua/connector.rs` — Rust OPC-UA connector
- `/next-trend/ignition/gateway/` — Ignition historian module (Java)
- `/net-topology/` — 922 devices, OT network topology

### Infrastructure Documentation
- `/iso-planning/10-infra-discovery/01-ot-architecture.md` — OT architecture
- `/iso-planning/10-infra-discovery/03-network-topology.md` — Network segmentation

### Memory References
- `decision_ignition_replacement.md` — Strategic replacement decision
- `reference_opcua_i3x_stack.md` — OPC-UA library + i3X spec
- `project_ignition_scada.md` — Current Ignition state
- `project_ignition_global.md` — Ignition Global middleware
- `feedback_hardened_grpc.md` — gRPC binary transport requirement
