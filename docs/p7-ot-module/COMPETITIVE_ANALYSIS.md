# Forge OT Module — Competitive Analysis & Capability Mapping

**Date:** 2026-04-08
**Purpose:** Map Ignition's full capability set and define where Forge matches, exceeds, or delegates each capability.

---

## 1. Ignition Platform: Complete Module Inventory

Ignition is not a single product — it's an **11-module industrial application platform**. Understanding each module is essential to building something that genuinely exceeds it.

### 1.1 Core Modules

| # | Module | Function | Forge Equivalent |
|---|--------|----------|-----------------|
| 1 | **Tag System** (built-in) | Tag engine: OPC, Memory, Expression, Query, Derived, Reference tags. UDTs for templated structures. Tag folders, providers, history configuration per-tag. | **Forge OT Module Tag Engine** (P7 — must match and exceed) |
| 2 | **Perspective** | HTML5/CSS web-based HMI. Responsive design, mobile-first, component palette, Perspective Symbols (P&ID, Simple, Mimic), drag-and-drop screen builder. | **OT UI Builder** (P9 — future, separate module) |
| 3 | **Vision** | Java Swing desktop HMI client. Legacy but still widely used. Rich component library. | **Not replicated** — Perspective replacement (P9) is web-only |
| 4 | **Tag Historian** | Bidirectional SQL time-series logging. Per-tag history config (sample rate, mode, deadband). Store-and-forward buffering. | **NextTrend** (existing — Rust/QuestDB, already superior) |
| 5 | **SQL Bridge** | Bidirectional OPC ↔ SQL database transaction manager. Transaction groups: historical logging, DB-to-OPC sync, recipe loading. Store-and-forward. | **Forge OT Module Query Tags + Data Bridge** (P7 Phase 2–4) |
| 6 | **Alarm Notification** | ISA-18.2 alarm state machine. Notification pipelines (email, SMS, voice). Alarm journal (SQL). Shelving, acknowledgment, escalation. | **Forge OT Module Alarm Engine** (P7 Phase 3) |
| 7 | **Reporting** | Dynamic PDF report generation from templates. Scheduled or on-demand. Data from tags, databases, or scripts. | **Forge Reporting Module** (future, or NextTrend dashboards) |
| 8 | **SFC (Sequential Function Charts)** | IEC 61131-3 visual logic programming. ISA-88 batch control. Steps, transitions, parallel blocks. 5 charts per phase (run, hold, restart, abort, stop). | **Forge SFC/Batch Engine** (future consideration, or MES-side) |
| 9 | **WebDev** | Custom REST API endpoints on the gateway. Python scripting for HTTP methods. Serve JSON, HTML, static resources. | **Forge OT Module REST/i3X API** (P7 built-in) |
| 10 | **EAM (Enterprise Administration)** | Multi-gateway management from one controller. Agent/controller architecture. Centralized backup, updates, monitoring. | **Forge Hub** (existing — centralized management is core architecture) |
| 11 | **Gateway Network** | Site-to-site communication. Redundancy/failover (active-passive). Edge gateway integration. Store-and-forward between sites. | **Forge Hub + gRPC transport** (existing — hardened protobuf) |

### 1.2 Edge Editions

| Edition | Function | Forge Equivalent |
|---------|----------|-----------------|
| **Ignition Edge Panel** | Lightweight HMI at the edge. Limited tags. | OT Module can run in edge mode (future) |
| **Ignition Edge IIoT** | MQTT/SparkplugB at the edge. Unlimited tags. | OT Module MQTT pub/sub (P7 Phase 2) |
| **Ignition Edge Compute** | Gateway scripting, REST APIs at the edge. | OT Module + Python runtime (native) |

### 1.3 Third-Party Modules (Ignition Ecosystem)

| Module | Vendor | Function | Forge Equivalent |
|--------|--------|----------|-----------------|
| **Batch Procedure** | Sepasoft | ISA-88 batch control, recipe management, electronic batch records | MES recipe module (whk-mes) |
| **OEE Downtime** | Sepasoft | Overall Equipment Effectiveness tracking | Future Forge analytics |
| **Track & Trace** | Sepasoft | Material genealogy, lot tracking | WMS lot tracking (whk-wms) |
| **MQTT Engine** | Cirrus Link | MQTT/SparkplugB subscriber | OT Module MQTT subscriber (P7) |
| **MQTT Transmission** | Cirrus Link | MQTT/SparkplugB publisher | OT Module MQTT publisher (P7) |
| **MQTT Distributor** | Cirrus Link | Built-in MQTT broker | External broker (RabbitMQ) |
| **Web Services** | Sepasoft | REST/SOAP integration | OT Module REST API (P7) |
| **Symbol Factory** | Inductive | 4,000 industrial SVG symbols | OT UI Builder symbol library (P9) |

### 1.4 Ignition 8.3 Advances (Fall 2025)

| Feature | Description | Forge Advantage |
|---------|-------------|-----------------|
| **JSON-as-Code** | All config stored as JSON files, enabling Git version control | Forge is spec-first from day one — FACTS/FTTS govern all config |
| **Event Streams** | Kafka/HTTP/DB event routing without scripting | Forge has RabbitMQ + MQTT + gRPC event routing natively |
| **Protobuf RPC** | Faster gateway-to-client communication | Forge uses hardened gRPC+Protobuf as standard transport |
| **Deployment Modes** | Dev/Test/Prod workflows | Forge modules are containerized with standard CI/CD |
| **REST API** | Gateway management REST API | Forge Hub API is REST+GraphQL+MCP from the start |

---

## 2. Ignition Tag System: Deep Analysis

The tag system is Ignition's core. Every other module depends on it.

### 2.1 Tag Types

| Type | Source | Behavior | Forge OT Module Equivalent |
|------|--------|----------|---------------------------|
| **OPC Tag** | OPC-UA item path on a device connection | Value driven by OPC subscription. Real-time PLC data. | **Standard Tag** — OPC-UA subscription to PLC node |
| **Memory Tag** | None (user-set) | Holds value until explicitly changed by script/binding. No polling. Useful for intermediate calculations, user inputs, setpoints. | **Memory Tag** — In-memory key-value store, persisted optionally |
| **Expression Tag** | Expression engine | Value computed from mathematical expressions referencing other tags. Same syntax as property bindings. Re-evaluates on dependency change. | **Expression Tag** — Python 3.12+ expression engine with tag references and full language access |
| **Query Tag** | SQL database | Value sourced from a SQL query on a configurable polling interval. Can pull from any connected database. | **Query Tag** — Async SQL query against any configured database |
| **Derived Tag** | Another tag + read/write expressions | Abstracted reference to a source tag with read expression (transform on read) and write expression (transform on write). Bidirectional. | **Derived Tag** — Source tag + read/write transform expressions |
| **Reference Tag** | Another tag | Simple alias/pointer to another tag. No transformation. | **Reference Tag** — Alias with optional path remapping |

### 2.2 Tag Organization

| Feature | Ignition | Forge OT Module |
|---------|----------|-----------------|
| **Tag Folders** | Hierarchical folder structure. Unlimited depth. | Hierarchical folders with slash-separated paths |
| **Tag Providers** | Multiple providers per gateway (Internal, Remote). Each provider is an independent tag database. | **Tag Providers** — OPC-UA providers (per PLC), Memory provider, Expression provider, Query provider |
| **UDTs (User Defined Types)** | Parameterized tag templates. Define once, instantiate many times. Changes propagate to all instances. Parameters for dynamic OPC paths. | **Tag Templates** — Parameterized templates with inheritance. Changes propagate. Parameters for dynamic source resolution. |
| **Tag Properties** | Each tag has: Value, Quality, Timestamp, DataType, EngUnit, Tooltip, Documentation, FormatString, ScaleMode, RawMin/Max, ScaledMin/Max, ClampMode, etc. | Each tag has: value, quality, timestamp, data_type, engineering_units, description, metadata dict, scale config, clamp config |
| **Tag History** | Per-tag: history provider, sample rate, sample mode (on-change/periodic), deadband, tag group. | Per-tag: history_enabled, sample_mode, deadband, publish_to (NextTrend, MQTT, both) |
| **Tag Alarms** | Per-tag: multiple alarm modes (High, HiHi, Low, LoLo, Bad Quality, Bit Pattern, Any Change). Each alarm has priority, notes, display path. | Per-tag: alarm configs (threshold, digital, ROC, quality, communication). Each with priority, description, notification routing. |
| **Tag Groups** | Configurable execution rates. Tags in same group poll at same interval. Default, leased, dedicated. | **Scan Classes** — configurable execution rates per group |

### 2.3 What Ignition Gets Wrong (Opportunities to Exceed)

| Weakness | Description | Forge Advantage |
|----------|-------------|-----------------|
| **Jython 2.7** | Scripting locked to Python 2.7 (Jython). No async, no type hints, no modern libraries. 585+ `system.*` call sites in WHK's 1,539 Jython files. | **Python 3.12+ scripting engine** with full async, type safety, UV/Ruff toolchain, `forge.*` SDK namespace (see P7_RESEARCH_SUMMARY.md Section 9) |
| **No spec governance** | Tag structures configured via GUI. No machine-readable spec. Changes not version-controlled (until 8.3). | **FACTS spec** governs all tag configurations. Machine-readable, version-controlled, CI-enforced. |
| **Gateway-centric** | All data routes through one gateway process. Single point of failure for data acquisition. | **Distributed** — each PLC connection is independent. Hub aggregates but doesn't bottleneck. |
| **No context enrichment** | Tags carry value + quality + timestamp. No batch_id, recipe_id, operating_mode, or business context. | **ContextualRecord** wraps every value with full business context for decision-making. |
| **Closed module ecosystem** | Third-party modules (Sepasoft, Cirrus Link) are proprietary, expensive, vendor-locked. | **Open module architecture** — any Python package, any protocol, governed by FACTS. |
| **No built-in MQTT publishing** | Requires Cirrus Link MQTT Transmission module ($$$). | **Built-in MQTT pub/sub** — first-class capability, no add-on. |
| **Alarm notifications are basic** | Email, SMS, voice only. No webhook, no Slack, no Teams, no custom routing. | **Pluggable notification** — MQTT, RabbitMQ, webhook, Slack, Teams, email, custom. |
| **No AI/ML integration** | No native ML model execution. Requires external integration. | **Forge AI agents** can consume ContextualRecords for predictive maintenance, anomaly detection. |
| **Scaling requires more gateways** | To scale, add more Ignition gateways + EAM. Per-server licensing. | **Horizontal scaling** — add more OT Module instances, no licensing cost. |
| **Security model is coarse** | System-level permissions. Scripts run with gateway service account privileges. CISA advisory on unrestricted Python imports. | **Fine-grained RBAC** — per-tag, per-area write permissions. Sandboxed execution. |

---

## 3. Competitive Landscape Summary

### 3.1 Platform Comparison

| Capability | Ignition | AVEVA | Siemens WinCC | GE iFIX | **Forge OT Module** |
|------------|---------|-------|---------------|---------|---------------------|
| **Licensing** | $7,500/server, unlimited tags | $25,000+, tag-based | $15,000+, tag-based | $18,000+, tag-based | **Open source, unlimited** |
| **Tag Types** | 6 types + UDTs | Object-oriented (ArchestrA) | WinCC tags + PLC types | Tag groups | **9 types + Templates** |
| **Protocols** | OPC-UA, Modbus, BACnet, MQTT (add-on) | OPC, MQTT, proprietary | OPC, S7, PROFINET | OPC, GE proprietary | **OPC-UA, MQTT, SparkplugB, Modbus (native)** |
| **Scripting** | Jython 2.7 | VBScript, C# | VBScript, C/C++ | VBA | **Python 3.12+ async** |
| **Architecture** | Gateway-centric | ArchestrA object model | TIA Portal integrated | Workspace-based | **Distributed, spec-governed** |
| **Edge Computing** | Ignition Edge (limited) | AVEVA Edge | WinCC OA | Proficy Edge | **Native Python edge runtime** |
| **AI/ML** | None native | Basic analytics | None native | Proficy Analytics | **Forge AI agent integration** |
| **Version Control** | Git (8.3+, new) | None | None | None | **Git-native from day one** |
| **Context Enrichment** | None | None | None | None | **ContextualRecord (unique)** |
| **Governance** | None | None | None | FDA 21 CFR Part 11 | **FACTS/FTTS/FxTS spec-first** |

### 3.2 Where Forge MUST Match Ignition (Table Stakes)

These are non-negotiable — without them, the OT Module is not a credible Ignition replacement:

1. **All 6 tag types** (OPC, Memory, Expression, Query, Derived, Reference)
2. **UDT-equivalent templates** with parameter inheritance
3. **Tag folders and providers** with hierarchical organization
4. **Per-tag alarm configuration** with ISA-18.2 state machine
5. **Per-tag history configuration** (sample rate, mode, deadband)
6. **Store-and-forward** for buffering during connectivity loss
7. **Auto-reconnect** with session recovery
8. **REST API** for external integration
9. **Bidirectional SQL ↔ OPC** data bridging (SQL Bridge equivalent)
10. **Multi-PLC connection management**

### 3.3 Where Forge EXCEEDS Ignition (Competitive Advantages)

1. **ContextualRecord enrichment** — Every tag value carries equipment_id, area, batch_id, recipe_id, operating_mode. No other SCADA platform does this.
2. **Spec-first governance** — FACTS spec machine-readable, CI-enforced. Tag configurations are governed artifacts.
3. **Built-in MQTT pub/sub** — No add-on module needed. Real-time fan-out for dashboards and decision systems.
4. **Python 3.12+ scripting** — Async, type-safe, modern ecosystem. Not Jython 2.7.
5. **gRPC+Protobuf transport** — Binary-efficient, schema-enforced, not JSON-over-HTTP.
6. **AI/ML native** — ContextualRecords feed directly into Forge AI agents for predictive maintenance.
7. **No per-tag licensing** — Truly unlimited. No "unlimited but actually limited by gateway performance."
8. **Open architecture** — Any Python library, any protocol adapter, any database.
9. **Tag types Ignition doesn't have** — Computed tags (multi-source aggregation), Event tags (triggered by external events), Virtual tags (from external databases like NextTrend virtual connections).
10. **First-class SparkplugB** — Not a $4,000 add-on from Cirrus Link.

---

## 4. Tag Engine Design Requirements

Based on competitive analysis, the Forge OT Module Tag Engine must support:

### 4.1 Tag Types (9 types — exceeds Ignition's 6)

| # | Tag Type | Source | Update Trigger | Persistence | Ignition Equiv |
|---|----------|--------|---------------|-------------|----------------|
| 1 | **OPC Tag (Standard)** | OPC-UA node on a PLC | Subscription data change | PLC is source of truth | OPC Tag |
| 2 | **Memory Tag** | None (user-set) | Explicit write (API, script, MQTT) | In-memory + optional DB persist | Memory Tag |
| 3 | **Expression Tag** | Python expression referencing other tags | Dependency change | Computed on-the-fly | Expression Tag |
| 4 | **Query Tag** | SQL query against any configured database | Configurable poll interval | Cached result | Query Tag |
| 5 | **Derived Tag** | Source tag + read/write transform expressions | Source tag change | Computed on-the-fly | Derived Tag |
| 6 | **Reference Tag** | Alias to another tag (any type) | Source tag change | Pass-through | Reference Tag |
| 7 | **Computed Tag** ★ | Multi-source aggregation (avg, sum, min, max, count across tag set) | Any source change | Computed | **NEW** — no Ignition equivalent |
| 8 | **Event Tag** ★ | Value set by external event (MQTT message, RabbitMQ event, webhook) | Event arrival | Last event value | **NEW** — no Ignition equivalent |
| 9 | **Virtual Tag** ★ | Value from external data source (NextTrend history, external DB, REST API) | Configurable poll or on-demand | Cached with TTL | **NEW** — similar to NextTrend virtual connections |

★ = Forge-exclusive tag types that exceed Ignition's capabilities

### 4.2 Tag Templates (UDT Equivalent)

```
Template: VFD_Drive
  Parameters:
    plc_connection: str       # Which PLC
    base_path: str            # OPC-UA base node path
    equipment_id: str         # CMMS asset reference
    area: str                 # Production area

  Tags:
    speed_feedback:   OPC Tag  → {plc_connection}/{base_path}/HMI_FeedbackSpeed
    output_current:   OPC Tag  → {plc_connection}/{base_path}/HMI_OutputCurrent
    motor_enable:     OPC Tag  → {plc_connection}/{base_path}/HMI_MO  (writable)
    speed_setpoint:   OPC Tag  → {plc_connection}/{base_path}/HMI_MS  (writable)
    alarm_status:     OPC Tag  → {plc_connection}/{base_path}/Status_ALM
    is_running:       Expression Tag → speed_feedback > 0.5
    efficiency:       Computed Tag  → (speed_feedback / speed_setpoint) * 100
    fault_active:     Derived Tag   → alarm_status, read_expr="bool(value & 0x01)"

  Alarms:
    overcurrent:  threshold on output_current, priority=HIGH, setpoint=150.0
    stall:        threshold on speed_feedback, priority=CRITICAL, setpoint=0.0, delay=5s
    fault:        digital on fault_active, priority=HIGH

  History:
    speed_feedback:  sample_mode=on_change, deadband=0.5, publish_to=[nexttrend, mqtt]
    output_current:  sample_mode=periodic, interval=5s, publish_to=[nexttrend]
```

### 4.3 Tag Provider Architecture

```
Tag Engine
├── OPC-UA Provider (per PLC connection)
│   ├── plc100/ (Grain/Milling)
│   ├── plc200/ (Fermentation/Distillation)
│   ├── plc300/ (Barrel/Aging)
│   └── plc400/ (Utilities)
├── Memory Provider
│   ├── setpoints/
│   ├── operator_inputs/
│   └── intermediate_calculations/
├── Expression Provider
│   ├── derived_metrics/
│   └── calculated_values/
├── Query Provider
│   ├── database_lookups/
│   └── recipe_parameters/
├── Event Provider
│   ├── mqtt_events/
│   ├── rabbitmq_events/
│   └── webhook_events/
└── Virtual Provider
    ├── nexttrend_history/
    └── external_databases/
```

### 4.4 OPC-UA Address Space Exposure (i3X-Compliant)

The OT Module must **expose the full PLC tag structure** to users via an API modeled on the **CESMII i3X specification** (https://github.com/cesmii/i3X). Rather than inventing a custom browse API, we adopt the i3X data model (Namespace → ObjectType → ObjectInstance → Values + History + Subscriptions) and adapt it to FxTS governance.

1. **i3X Namespaces** — `GET /api/v1/ot/namespaces` → PLC connections as i3X namespaces
2. **i3X Object Types** — `GET /api/v1/ot/objecttypes?namespace=plc200` → equipment types from address space
3. **i3X Browse/Objects** — `GET /api/v1/ot/objects?namespace=plc200&path=Fermentation/` → child nodes, data types, access levels
4. **i3X Values** — `GET /api/v1/ot/objects/value?path=...` → live value preview without subscription
5. **i3X Subscriptions (SSE)** — `GET /api/v1/ot/subscriptions` → real-time value streaming
6. **Tag Discovery** — `POST /api/v1/ot/discover` → auto-creates tag definitions from PLC address space
7. **Drag-and-Drop Tag Creation** — Browse → select nodes → create tags with auto-populated metadata (future, for OT UI Builder)

---

## 5. Module-by-Module Forge Parity Map

### Capabilities Forge Handles Natively (No Additional Module Needed)

| Ignition Capability | Forge Solution | Status |
|---------------------|---------------|--------|
| Tag Engine (6 types + UDTs) | OT Module Tag Engine (9 types + Templates) | P7 Phase 2 |
| OPC-UA connectivity | OT Module OPC-UA client | P7 Phase 1 |
| MQTT pub/sub | OT Module built-in MQTT | P7 Phase 2 |
| Alarm management | OT Module Alarm Engine | P7 Phase 3 |
| Control writes | OT Module Write Interface | P7 Phase 4 |
| REST API | OT Module + Forge Hub API | P7 Phase 2 |
| Gateway Network | Forge Hub gRPC transport | Existing |
| Enterprise Management | Forge Hub centralized management | Existing |
| Store-and-forward | OT Module local buffer | P7 Phase 2 |

### Capabilities Handled by Other Forge Modules

| Ignition Capability | Forge Solution | Status |
|---------------------|---------------|--------|
| Tag Historian | NextTrend (Rust/QuestDB) | Complete (P5) |
| MES/Batch | whk-mes (NestJS) | Complete |
| CMMS | whk-cmms (NestJS) | Complete (P2) |
| HMI/Visualization | OT UI Builder | P9 (future) |
| Reporting | Forge Reporting Module | Future |
| SFC/Batch Control | MES + OT Module write sequences | Future |

### Capabilities Where Forge Has No Equivalent Yet

| Ignition Capability | Gap | Priority |
|---------------------|-----|----------|
| Symbol Factory (4,000 SVGs) | OT UI Builder needs industrial symbol library | P9 |
| SFC visual editor | Drag-and-drop sequential logic | Future |
| Vision (desktop client) | No desktop client planned (web-only) | N/A — intentional |
| OPC-COM bridge | Legacy COM protocol support | Low — modern PLCs use OPC-UA |

---

## 6. Sources

- [Ignition SCADA Platform Overview](https://inductiveautomation.com/ignition/)
- [Types of Tags - Ignition User Manual](https://docs.inductiveautomation.com/docs/8.3/platform/tags/types-of-tags)
- [Ignition SCADA Wikipedia](https://en.wikipedia.org/wiki/Ignition_SCADA)
- [NFM Consulting - Complete Guide to Ignition](https://www.nfmconsulting.com/knowledge/ignition-scada-complete-guide/)
- [Ignition Alarm Management - NFM Consulting](https://www.nfmconsulting.com/knowledge/ignition-scada-alarm-management/)
- [Best SCADA Software 2025 - Top 10 Platforms](https://plcprogramming.io/blog/best-scada-software-2025)
- [Industrial SCADA Comparison - Industrial Monitor Direct](https://industrialmonitordirect.com/blogs/knowledgebase/industrial-scada-software-selection-guide-ignition-vs-wincc-vs-aveva)
- [Top 8 SCADA Platforms Compared 2025](https://tatsoft.com/top-8-scada-platforms-compared/)
- [Ignition 8.3 New Features](https://inductiveautomation.com/ignition/whatsnew)
- [Ignition SFC Module](https://inductiveautomation.com/ignition/modules/sequential-function-charts)
- [Ignition SQL Bridge Module](https://inductiveautomation.com/ignition/modules/sql-bridge)
- [Ignition EAM Module](https://inductiveautomation.com/ignition/modules/eam)
- [Ignition WebDev Module](https://www.docs.inductiveautomation.com/docs/7.9/scripting/scripting-in-ignition/web-services-suds-and-rest/web-dev)
- [Ignition UDTs Documentation](https://www.docs.inductiveautomation.com/docs/8.1/platform/tags/user-defined-types-udts)
- [Ignition Perspective Module](https://inductiveautomation.com/ignition/modules/perspective)
- [CISA Advisory on Ignition Security](https://www.cisa.gov/news-events/ics-advisories/icsa-25-352-01)
- [Ignition Gartner Reviews 2026](https://www.gartner.com/reviews/market/scada-software/vendor/inductive-automation/product/ignition)
- [Complete Guide to SCADA Systems 2026](https://distk.in/blog/complete-guide-scada-systems-2026-platform-comparison-selection-implementation)
