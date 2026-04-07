# Forge Platform — Strategic Architecture

**Manufacturing Decision Infrastructure**

*Version 0.2 — April 2026 (aligned with WHK Digital Strategy v4r0)*

---

## 1. Vision & Problem Statement

### The Problem

Manufacturing enterprises make confidently wrong decisions every day. Not because the people involved are careless or unintelligent, but because the information systems they rely on do not preserve the structure required for sound inference.

Data is generated everywhere — on PLCs controlling fermentation, in SCADA systems monitoring utilities, in MES tracking production orders, in QMS managing deviations, in WMS tracking inventory movements, in ERP processing financial transactions. Each system captures a fragment of reality. None of them captures enough.

When a quality test flags a batch, the test result lives in LIMS. The process conditions live in the historian. The material lot information lives in ERP. The maintenance history for the equipment lives in CMMS. The scheduling context that determined which shift ran which material on which line lives in the MES or a spreadsheet. The alarm that almost triggered but didn't lives in the SCADA log. The root-cause analysis that someone did six months ago on a similar problem lives in a Word document on a shared drive, if it exists at all.

The consequence is predictable: teams look at whatever fragment is visible in whatever system they have open, construct a coherent story from that fragment, and act on it. The story feels reasonable because the information available makes it look reasonable. The cost of being wrong is paid later, distributed across departments, and attributed to something else.

This is not primarily a talent problem. It is a systems problem. The architecture of the information environment determines the quality of the decisions it can support. When that architecture is fragmented, incomplete, or disconnected from operational context, even capable teams will misread patterns, overreact to noise, normalize the wrong variables, and act on incomplete stories with full confidence.

### The Cost

The cost of fragmented information is recurring and distributed:

- **Avoidable yield loss** from incomplete process context
- **Slow root-cause analysis** from inability to link cross-system signals
- **Manual reconciliation** consuming skilled labor across departments
- **Excess inventory and safety stock** driven by low trust in data signals
- **Expedites and schedule disruption** from late or wrong decisions
- **Erosion of trust** in data, systems, and cross-functional relationships

These costs do not appear on any single line item. They are absorbed quietly across functions and across time. That is precisely why they persist.

### The Solution

Forge is a hub-and-spoke modular infrastructure platform that collects, governs, stores, curates, and serves data from the systems that generate it and delivers it back to those systems and to the people who need it — with the operational context preserved.

The platform's primary design objective is not data movement. It is **decision quality**. Every architectural choice, every governance rule, every integration pattern is evaluated against a single question: *does this improve the likelihood that the business will make a correct decision?*

---

## 2. Design Philosophy

### Core Principles

These principles are non-negotiable. They govern every design decision in the platform.

**1. Decision quality first.** Every meaningful component must improve the business's ability to make better decisions. That means preserving context, reducing ambiguity, shortening the time from signal to action, and lowering the cost of being wrong.

**2. Data ownership and openness.** The enterprise owns its data. Systems must expose well-documented, standards-based APIs, support bulk export, and avoid contractual or technical lock-in that prevents the business from governing, reusing, or migrating its own information.

**3. Integration first.** No net-new capability enters production without architecture, security, and data governance review. If a module cannot integrate cleanly into the platform, it does not fit the strategy.

**4. Build → Compose → Buy.** Prefer custom where capability is strategic. Compose from open standards where practical. Buy only when the solution fits architectural guardrails, data requirements, and long-term operating model.

**5. Edge-driven, hub-governed.** Transform data as close to the source as practical. Publish it to a governed hub for reuse across business layers. The edge reduces latency and noise; the hub preserves standards, lineage, and reuse.

**6. Context before conclusion.** Data products must preserve the operating context required for sound interpretation: lineage, time alignment, equipment state, material genealogy, operating mode, batch or lot context, versioned definitions, and relevant normalization factors. Reports that hide structure create avoidable decision error.

**7. Human judgment, structured challenge.** Digital systems should support human judgment, not bypass it blindly. Important workflows should make assumptions visible, support risk-and-opportunity review, capture rationale where needed, and make it easier to challenge weak conclusions before action hardens.

**8. Security by design.** Zero-Trust access, least privilege, strong identity, audit trails, and a provable software supply chain are mandatory. Security is part of the operating foundation, not a bolt-on.

**9. Continuous improvement.** Treat the platform as a living product. Iterate through roadmaps, SLOs, measured outcomes, and lessons learned. Progress will be slowest at the foundation stage and accelerate as governed infrastructure matures.

### The FxTS Principle: Specs Define What Exists

The most important architectural principle in Forge — inherited from MDEMG's UxTS framework — is this:

**The specification is the contract. The spec defines what must exist and how it must behave. The implementation is the servant of the spec. The runner enforces conformance. The CI gate blocks anything that deviates.**

This is **spec-first governance**, not test-first verification. The distinction is critical:

- **Test-first:** Implementation exists → tests verify it works
- **Spec-first:** Spec defines what MUST exist → implementation must conform → runners enforce → CI gates block deviation

When a FATS spec declares that `GET /v1/data-products/{id}` returns 200 with a specific response shape, that spec is not a test of an existing endpoint. It is a **prior commitment** — a declarative contract that the system must obey. The endpoint exists because the spec says it must. If the implementation drifts, the runner catches it and CI blocks the merge. If the spec changes, the diff is visible in code review, making every behavioral change explicit, reviewed, and documented.

This is how governance scales. It is how silent drift is prevented. It is how "specs that pass but verify nothing" (the 0/0 problem) are eliminated. It is how the platform maintains structural integrity as it grows.

Every FxTS framework operates this way. FATS defines API contracts. FACTS defines adapter conformance contracts. FQTS defines data quality contracts. FLTS defines lineage integrity contracts. The pattern is identical everywhere: **the spec is the source of truth; everything else conforms to it.**

### Technical Invariants

These are architectural laws that must not be violated:

- **Specs are the source of truth** — all platform behavior is defined by FxTS specifications. Implementation code conforms to specs, not the other way around. Behavioral changes require spec changes; spec changes require review. No specification field is silently ignored.
- **Context is a first-class citizen** — every data record carries its operational context (source, timestamp, equipment, batch/lot, operating mode, lineage) or a reference to it. Context is never silently dropped.
- **Governance is declarative** — all governance rules (quality, lineage, normalization, security) are expressed as declarative FxTS specifications, not embedded in application code.
- **Schema-runner parity is mandatory** — every field in an FxTS schema must be enforced by the runner or detected as unimplemented with a hard fail. Silent ignore of schema fields is prohibited.
- **Adapters are plugins** — all system integrations are implemented as adapters conforming to a standard interface governed by FACTS specs. The hub knows nothing about adapter internals.
- **Storage is polyglot** — different data types route to appropriate storage engines. No single database is forced to serve all access patterns.
- **Serving is API-first** — all data access goes through versioned APIs defined by FATS specs. No direct database coupling from consuming applications.
- **Observability is built-in** — every service, adapter, and pipeline emits structured telemetry (metrics, logs, traces) via OpenTelemetry, governed by FOTS specs.
- **Fail-open where safe, fail-closed where not** — optional enrichment stages degrade gracefully; security, governance, and spec conformance checks fail closed.

### Module Map (WHK Reference Implementation)

The WHK deployment is the reference implementation of Forge. Each module evolves from (or replaces) an existing WHK production system. These are not abstract adapter tiers — they are named systems with known repositories, tech stacks, and data patterns. See `PLAN.md` for full details and `SPOKE_ONBOARDING.md` for onboarding priority.

| # | Module | Source Repository | Role |
|---|--------|-------------------|------|
| 1 | **OT Module** | Custom (new build) | Direct PLC connectivity, tag acquisition, alarming, control writes. Replaces Ignition SCADA. |
| 2 | **NextTrend** | `TheThoughtagen/nexttrend` | Time-series historian (Rust+QuestDB). Replaces Canary/PI. |
| 3 | **OT UI Builder** | Future | User-built HMI screens. Replaces Ignition Perspective. |
| 4 | **CMMS** | `reh3376/whk-cmms` | PM scheduling, work orders, asset registry. |
| 5 | **WMS** | `WhiskeyHouse/whk-wms` | Barrel tracking, ownership, transfers, lot management. |
| 6 | **MES** | `WhiskeyHouse/whk-mes` | Production orders, recipes, scheduling, quality, ERP sync. |
| 7 | **IMS** | `reh3376/bosc_ims` | Aerospace supply chain inventory. Compliance-enforcing spoke. |
| 8 | **QMS** | New build | Document control, CAPA, audits, GRC. Replaces Intellect QMS. |
| 9 | **ERP Connector** | `WhiskeyHouse/whk-erpi` | Bidirectional NetSuite sync. 38 RabbitMQ topics. |
| 10 | **NMS** | `WhiskeyHouse/net-topology` | SNMP/LLDP discovery, topology visualization, security events. |
| + | **Scanner Gateway** | `WhiskeyHouse/whk-wms-android` | OT-tier QR scanner adapter. |

### Core Capabilities (cross-cutting)

Two capabilities span all modules and are not standalone applications:

**Support & Project Management Orchestration** — Cross-module ticket lifecycle and workflow orchestration. An NMS alert can trigger a CMMS work order, which may surface a QMS deviation, which can place an MES production hold — all with a unified audit trail. This is the human-in-the-loop touchpoint across domain boundaries.

**WorkOS Identity & Access Layer** — Unified authentication and authorization across all modules, replacing the current mix of Azure Entra ID, JWT, and NextAuth. Built on WorkOS AuthKit: enterprise SSO (SAML/OIDC), SCIM directory sync, RBAC progressing to fine-grained authorization (resource-hierarchical permissions), audit logs (ISO 27001 A.12.4), and feature flags.

### Integration Backbone

- **gRPC+Protobuf** for hub↔spoke transport. Compiled binary protobuf over the wire (never JSON-over-gRPC). `GrpcTransportAdapter` wraps any `AdapterBase` with zero code changes. Governed by FTTS (Forge Transport Test Specification).
- **RabbitMQ topic exchange** (proto-UNS) for event-driven module integration. The existing `wh.whk01.distillery01.*` hierarchy already connects ERPI, CMMS, WMS, and MES.
- **Kafka** is the target enterprise event bus as volume and consumer count grow.

### Ignition Replacement Strategy

Ignition SCADA and the Ignition Global middleware (1,539 Jython files) are being replaced by the Forge OT Module. During migration, adapters bridge existing Ignition screens while the OT Module takes over tag acquisition, alarming, and control writes incrementally. Target: complete Ignition decommission by 2027.

---

## 3. Core Architecture

### Hub-and-Spoke Overview

```
                            ┌─────────────────────────────────┐
                            │         CONSUMING LAYER          │
                            │  NextJS Portals  │  Dashboards   │
                            │  BI Tools  │  AI/ML  │  Agents   │
                            │  External Systems  │  Reports    │
                            └──────────────┬──────────────────┘
                                           │
                              ┌─────────────▼──────────────┐
                              │      SERVING LAYER          │
                              │  REST + GraphQL + gRPC      │
                              │  Streaming (Kafka CDC)      │
                              │  Subscriptions + Webhooks   │
                              │  Query Federation           │
                              └─────────────┬──────────────┘
                                            │
                ┌───────────────────────────▼───────────────────────────┐
                │                    HUB (Core Platform)                │
                │                                                       │
                │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
                │  │   Schema    │  │  Governance   │  │   Context   │ │
                │  │  Registry   │  │   Engine      │  │   Engine    │ │
                │  └─────────────┘  └──────────────┘  └─────────────┘ │
                │                                                       │
                │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
                │  │  Storage    │  │   Message     │  │  Curation   │ │
                │  │ Orchestrator│  │   Broker      │  │  Service    │ │
                │  └─────────────┘  └──────────────┘  └─────────────┘ │
                │                                                       │
                │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
                │  │  Decision   │  │ Observability │  │    API      │ │
                │  │  Support    │  │    Stack      │  │  Gateway    │ │
                │  └─────────────┘  └──────────────┘  └─────────────┘ │
                └───────────────────────────┬───────────────────────────┘
                                            │
                              ┌─────────────▼──────────────┐
                              │    COLLECTION LAYER         │
                              │    (Adapter Framework)      │
                              └──┬──────┬──────┬──────┬────┘
                                 │      │      │      │
                    ┌────────────▼┐ ┌───▼────┐ ┌▼─────┐ ┌▼──────────┐
                    │  OT Tier    │ │MES/QMS │ │ ERP  │ │ Historian  │
                    │ PLC, SCADA  │ │WMS,LIMS│ │ SCM  │ │ PI, AVEVA │
                    │ HMI, DCS   │ │CMMS,EBR│ │ CRM  │ │ Wonderware│
                    └─────────────┘ └────────┘ └──────┘ └───────────┘
```

### Service Inventory

| Service | Language | Purpose | Dependencies |
|---------|----------|---------|--------------|
| **forge-gateway** | Python (FastAPI) | API routing, auth, rate limiting, request validation | Redis, all backend services |
| **forge-registry** | Python (FastAPI) | Schema registry, data contract management, version control | PostgreSQL |
| **forge-governance** | Python (FastAPI) | FxTS governance engine, quality rules, lineage tracking | PostgreSQL, Schema Registry |
| **forge-context** | Python (FastAPI) | Context attachment, preservation, enrichment | Redis, PostgreSQL |
| **forge-storage** | Python (FastAPI) | Storage orchestration, routing, multi-engine coordination | TimescaleDB, PostgreSQL, Neo4j, MinIO |
| **forge-curation** | Python (FastAPI) | Data products, normalization, materialized views | PostgreSQL, TimescaleDB |
| **forge-decision** | NestJS + NextJS | Decision support workflows, structured challenge, assumption tracking | PostgreSQL, forge-gateway |
| **forge-portal** | NextJS | User-facing portal, data exploration, admin console | NestJS BFF, forge-gateway |
| **forge-observer** | Python | Telemetry collection, alerting, SLO monitoring | OpenTelemetry Collector, Grafana |
| **forge-broker** | Kafka | Event-driven data flow, CDC, pub/sub | ZooKeeper / KRaft |
| **forge-cli** | Python (Typer) | Developer and operator CLI | All services via API |

### Storage Engines

| Engine | Technology | Data Types | Access Pattern |
|--------|-----------|------------|----------------|
| **Time-Series** | TimescaleDB | Sensor readings, process variables, metrics, alarms, events | High-frequency append, time-range queries, downsampling |
| **Relational** | PostgreSQL | Master data, config, quality records, transactions, governance state | CRUD, joins, referential integrity |
| **Graph** | Neo4j | Equipment topology, material genealogy, process flows, dependency maps | Traversal, path finding, pattern matching |
| **Object** | MinIO (S3) | Documents, images, certificates, blobs, exports | PUT/GET, presigned URLs, lifecycle policies |
| **Cache** | Redis | Real-time state, hot data, session, rate limiting, pub/sub | Sub-millisecond reads, TTL, streams |

---

## 4. Data Collection Layer (Adapter Framework)

### Adapter Architecture

Every external system connects to Forge through an **adapter** — a self-contained module that conforms to a standard interface. Adapters are the spokes of the hub-and-spoke model.

Adapters follow the plugin pattern proven in MDEMG: each adapter is a standalone process with a well-defined manifest, lifecycle, and data contract. The hub knows nothing about adapter internals. It only knows the adapter's manifest (what it can do), its data contract (what it produces), and its health status.

### Adapter Interface

Every adapter must implement:

```
┌────────────────────────────────────────────────────────────────┐
│                      Adapter Interface                          │
├────────────────────────────────────────────────────────────────┤
│  manifest()     → AdapterManifest                              │
│  connect()      → ConnectionStatus                             │
│  discover()     → List[DataSource]                             │
│  collect(source, since) → Stream[ContextualRecord]             │
│  health()       → HealthStatus                                 │
│  shutdown()     → void                                         │
│                                                                 │
│  Optional:                                                      │
│  write(target, records) → WriteResult   (bidirectional)        │
│  subscribe(source, callback) → Subscription (real-time)        │
│  backfill(source, range) → Stream[ContextualRecord] (history)  │
└────────────────────────────────────────────────────────────────┘
```

### Adapter Manifest

Every adapter declares its capabilities via a JSON manifest (adapted from MDEMG's plugin manifest pattern):

```json
{
  "adapter_id": "opcua-generic",
  "name": "OPC UA Generic Adapter",
  "version": "0.1.0",
  "type": "INGESTION",
  "protocol": "opcua",
  "tier": "OT",
  "capabilities": {
    "read": true,
    "write": false,
    "subscribe": true,
    "backfill": true,
    "discover": true
  },
  "data_contract": {
    "schema_ref": "forge://schemas/opcua-generic/v1",
    "output_format": "contextual_record",
    "context_fields": ["equipment_id", "tag_path", "engineering_units", "quality_code"]
  },
  "health_check_interval_ms": 5000,
  "connection": {
    "params": ["endpoint_url", "security_policy", "certificate_path"],
    "auth_methods": ["anonymous", "username_password", "certificate"]
  },
  "metadata": {
    "author": "forge-team",
    "license": "proprietary",
    "systems": ["Ignition", "KEPServerEX", "Prosys", "generic OPC UA server"]
  }
}
```

### Adapter Tiers

| Tier | Systems | Primary Protocols | Data Characteristics |
|------|---------|-------------------|----------------------|
| **OT** | PLC, SCADA, HMI, DCS, RTU | OPC UA, MQTT Sparkplug B, Modbus TCP, EtherNet/IP, PROFINET | High-frequency (ms-sec), time-series, real-time, deterministic |
| **MES/MOM** | MES (e.g. whk-mes), QMS, WMS (e.g. whk-wms), LIMS, CMMS, EBR | REST, GraphQL, JDBC/ODBC, OData, Kafka topics | Transaction-oriented, batch/lot context, quality records |
| **ERP/Business** | ERP, SCM, CRM, PLM, BI, HRM | REST, OData, RFC/BAPI (SAP), JDBC, GraphQL | Master data, financial transactions, planning, low-frequency |
| **Historian** | OSIsoft PI, AVEVA, Honeywell PHD, Canary, InfluxDB | Proprietary APIs, REST, ODBC, bulk export | Time-series archive, high-volume backfill, compression |
| **Document** | SharePoint, file shares, DMS, email | WebDAV, Graph API, IMAP, filesystem | Unstructured, metadata extraction, OCR, classification |

### Adapter Lifecycle

Adapted from MDEMG's plugin lifecycle:

```
                    ┌───────────┐
                    │REGISTERED │ Manifest loaded, not yet started
                    └─────┬─────┘
                          │ start()
                    ┌─────▼─────┐
                    │ CONNECTING│ Establishing connection to source system
                    └─────┬─────┘
                          │ connect() succeeds
                    ┌─────▼─────┐
                    │  HEALTHY  │◄──────────────┐ Normal operation
                    └─────┬─────┘               │
                          │ health check fails  │ health check passes
                    ┌─────▼─────┐               │
                    │ DEGRADED  │───────────────┘ Partial function
                    └─────┬─────┘
                          │ N consecutive failures
                    ┌─────▼─────┐
                    │  FAILED   │ Circuit open, queuing data
                    └─────┬─────┘
                          │ shutdown() or restart
                    ┌─────▼─────┐
                    │  STOPPED  │
                    └───────────┘
```

### The Contextual Record

The fundamental data unit in Forge is not a raw value. It is a **contextual record** — a value with its operational context attached. This is the core innovation that makes decision-quality possible.

```json
{
  "record_id": "uuid-v7",
  "source": {
    "adapter_id": "opcua-generic",
    "system": "ignition-prod",
    "tag_path": "Area1/Fermenter3/Temperature",
    "connection_id": "conn-abc123"
  },
  "timestamp": {
    "source_time": "2026-04-05T14:30:00.123Z",
    "server_time": "2026-04-05T14:30:00.125Z",
    "ingestion_time": "2026-04-05T14:30:00.200Z"
  },
  "value": {
    "raw": 78.4,
    "engineering_units": "°F",
    "quality": "GOOD",
    "data_type": "float64"
  },
  "context": {
    "equipment_id": "FERM-003",
    "area": "Fermentation",
    "site": "WHK-Main",
    "batch_id": "B2026-0405-003",
    "lot_id": "L2026-0405-CORN-A",
    "recipe_id": "RCP-BOURBON-001",
    "operating_mode": "PRODUCTION",
    "shift": "B",
    "operator_id": null
  },
  "lineage": {
    "schema_ref": "forge://schemas/opcua-generic/v1",
    "adapter_version": "0.1.0",
    "transformation_chain": []
  }
}
```

This structure ensures that when an analyst, dashboard, AI model, or automated workflow later reads this value, the context required for correct interpretation is present. The value `78.4°F` means something very different depending on whether the fermenter is in production, CIP, startup, or idle mode — and whether the corn lot has normal or elevated moisture content.

---

## 5. Governance Layer (FxTS Framework)

### Overview

FxTS (Forge x Test Specification) is the governance and instantiation framework for the Forge platform. It is adapted from MDEMG's UxTS framework — a specification-first governance system where specs define what must exist, implementations conform, runners enforce, and CI gates block deviation.

FxTS is not a testing layer bolted onto the platform. It is the **primary mechanism by which the platform's behavior is defined, governed, and enforced.** When a FATS spec declares an API endpoint, that endpoint is a contractual commitment. When a FACTS spec declares an adapter behavior, that behavior is non-negotiable. When a FQTS spec declares a quality rule, data that violates it is flagged, not silently accepted.

The development workflow is **spec-first:**

1. **Define the spec** — write the declarative JSON specification that says "this endpoint / adapter / quality rule MUST exist and behave this way"
2. **Implement conforming code** — write the FastAPI route, NestJS handler, or adapter logic that satisfies the spec
3. **Runner verifies** — the FxTS runner executes the spec against the live system and produces a canonical pass/fail report
4. **CI enforces** — the CI gate blocks merges if any hard-fail spec is violated

This means every behavioral change is a **diffable spec change** visible in code review. Silent drift is impossible. False passes (the 0/0 problem) are detected and blocked. Governance scales because every framework uses the identical four-layer pattern.

The core insight: **governance rules should be declarative data, not imperative code.** A JSON specification is diffable in pull requests, auditable by non-developers, versionable, executable by automated runners, and queryable programmatically.

### The Four-Layer Pattern

Every FxTS framework follows the same four-layer architecture:

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 4: CI/CD GATE                                          │
│  Automated enforcement in pipeline (hard-fail or soft-fail)   │
└──────────────────────────────────────────────────────────────┘
         │ executes
┌────────▼─────────────────────────────────────────────────────┐
│  Layer 3: RUNNER (Executable Harness)                         │
│  Python script that validates specs against live system        │
│  Commands: validate, validate-all, add-hashes, verify-hashes  │
│  Output: canonical JSON report                                 │
└──────────────────────────────────────────────────────────────┘
         │ validates
┌────────▼─────────────────────────────────────────────────────┐
│  Layer 2: SPECS (Declarative JSON)                            │
│  Test data, thresholds, assertions, variants                   │
│  One file per test case, diffable in PRs                       │
└──────────────────────────────────────────────────────────────┘
         │ conform to
┌────────▼─────────────────────────────────────────────────────┐
│  Layer 1: SCHEMA (JSON Schema draft 2020-12)                  │
│  Defines structure, required fields, enums, constraints        │
│  Single source of truth for spec format                        │
└──────────────────────────────────────────────────────────────┘
```

### FxTS Framework Inventory

| Framework | Full Name | Scope | CI Gate | MDEMG Analog |
|-----------|-----------|-------|---------|--------------|
| **FATS** | Forge API Test Specification | API contract verification for all platform endpoints | Hard-fail | UATS |
| **FACTS** | Forge Adapter Conformance Test Specification | Adapter output schema, lifecycle, and data contract validation | Hard-fail | UPTS |
| **FDTS** | Forge Data Test Specification | Data contract verification (schema evolution, compatibility) | Hard-fail | UDTS |
| **FQTS** | Forge Quality Test Specification | Data quality rules (completeness, accuracy, freshness, consistency) | Hard-fail | (new) |
| **FLTS** | Forge Lineage Test Specification | Lineage chain integrity, provenance verification | Soft-fail | (new) |
| **FNTS** | Forge Normalization Test Specification | Unit consistency, definition alignment, normalization factor verification | Soft-fail | UNTS (adapted) |
| **FSTS** | Forge Security Test Specification | Security controls, PII handling, access control, audit trail | Hard-fail | USTS |
| **FOTS** | Forge Observability Test Specification | Pipeline health, data freshness, latency, SLO compliance | Soft-fail | UOBS/UOTS |
| **FPTS** | Forge Performance Test Specification | Throughput and latency benchmarks under load | Soft-fail | UBTS |
| **FHTS** | Forge Hash Test Specification | Cross-cutting hash governance, change tracking, approval workflow | Hard-fail | UNTS (adapted) |
| **FTTS** | Forge Transport Test Specification | gRPC+Protobuf wire format, compiled stubs, RPC contract, error protocol | Hard-fail | (new) |

### Schema-Runner Parity Rule

Inherited from UxTS: **every field defined in a schema must be enforced by the runner or detected as unimplemented with a hard fail.** Silent ignore of schema fields is prohibited. This prevents governance decay — the situation where specs exist but the runner doesn't actually verify them.

### Example: FQTS (Data Quality) Spec

```json
{
  "fqts_version": "1.0.0",
  "rule": {
    "name": "fermenter_temperature_completeness",
    "description": "Fermenter temperature readings must be present at expected frequency",
    "category": "completeness",
    "severity": "high",
    "data_product": "fermentation_process_data",
    "applies_to": {
      "equipment_type": "fermenter",
      "tag_pattern": "*/Temperature"
    }
  },
  "assertions": {
    "expected_frequency_seconds": 10,
    "max_gap_seconds": 60,
    "min_completeness_pct": 99.5,
    "max_null_pct": 0.1,
    "quality_code_required": true,
    "context_fields_required": ["equipment_id", "batch_id", "operating_mode"]
  },
  "evaluation": {
    "window": "1h",
    "schedule": "continuous",
    "lookback_on_failure": "24h"
  },
  "metadata": {
    "author": "forge-team",
    "created": "2026-04-05",
    "tags": ["fermentation", "temperature", "completeness"],
    "sha256": null
  }
}
```

### Example: FACTS (Adapter Conformance) Spec

```json
{
  "facts_version": "1.0.0",
  "adapter": {
    "adapter_id": "opcua-generic",
    "version": ">=0.1.0",
    "description": "Validates OPC UA adapter conforms to Forge adapter interface"
  },
  "lifecycle_tests": [
    {
      "name": "manifest_valid",
      "assertion": "manifest conforms to adapter_manifest.schema.json"
    },
    {
      "name": "connect_timeout",
      "assertion": "connect() completes or fails within 30s",
      "timeout_ms": 30000
    },
    {
      "name": "health_check_interval",
      "assertion": "health() called at manifest.health_check_interval_ms ±10%"
    },
    {
      "name": "graceful_shutdown",
      "assertion": "shutdown() completes within 10s, no data loss",
      "timeout_ms": 10000
    }
  ],
  "data_contract_tests": [
    {
      "name": "output_schema",
      "assertion": "all records conform to contextual_record.schema.json"
    },
    {
      "name": "context_fields_present",
      "assertion": "context_fields declared in manifest are present on every record"
    },
    {
      "name": "timestamp_ordering",
      "assertion": "source_time is monotonically non-decreasing within a source"
    },
    {
      "name": "lineage_populated",
      "assertion": "lineage.schema_ref and lineage.adapter_version are non-null"
    }
  ],
  "metadata": {
    "author": "forge-team",
    "created": "2026-04-05",
    "tags": ["opcua", "adapter", "conformance"]
  }
}
```

### Governance Directory Layout

Every FxTS framework follows a consistent directory structure:

```
governance/
├── fats/                          # Forge API Test Specification
│   ├── schema/
│   │   └── fats.schema.json
│   ├── specs/
│   │   └── *.fats.json
│   ├── runners/
│   │   └── fats_runner.py
│   └── README.md
├── facts/                         # Forge Adapter Conformance Test Specification
│   ├── schema/
│   │   └── facts.schema.json
│   ├── specs/
│   │   └── *.facts.json
│   ├── runners/
│   │   └── facts_runner.py
│   └── README.md
├── fqts/                          # Forge Quality Test Specification
│   └── ...
├── shared/                        # Shared runner infrastructure
│   ├── fxts_report.py             # Canonical report builder
│   ├── fxts_runner_core.py        # SHA256, status computation, CLI base
│   └── fxts_schemas.py            # Common schema types
└── FRAMEWORK_GOVERNANCE.md        # FxTS governance policy document
```

---

## 6. Storage Layer

### Multi-Engine Strategy

Different data types have fundamentally different access patterns. Forcing all data into a single storage engine creates performance problems, schema contortion, and query complexity. Forge routes data to the appropriate engine based on its characteristics.

| Data Category | Engine | Rationale |
|---------------|--------|-----------|
| Sensor readings, process variables, alarms | TimescaleDB | Time-series native, compression, continuous aggregates, SQL compatible |
| Master data (equipment, materials, recipes) | PostgreSQL | Relational integrity, ACID, joins, JSON support |
| Batch/lot/quality records, transactions | PostgreSQL | Referential integrity, audit trails, complex queries |
| Equipment topology, material genealogy | Neo4j | Graph traversal, path finding, relationship-first queries |
| Documents, images, certificates, exports | MinIO | S3-compatible, lifecycle policies, versioning |
| Real-time state, hot data, caches | Redis | Sub-millisecond access, pub/sub, TTL |
| Governance state (specs, lineage, audit) | PostgreSQL | ACID, versioning, queryable metadata |

### Context Engine

The Context Engine is the service responsible for ensuring every data record carries its operational context. It operates at ingestion time and enrichment time.

**At ingestion:** When an adapter delivers a contextual record, the Context Engine validates that required context fields are present and enriches missing fields where possible by cross-referencing master data (equipment registry, active batch/lot, current shift, recipe in use).

**At query time:** When a consuming application requests data, the Context Engine can attach additional context that was not available at ingestion time (e.g., the final quality disposition of a batch that was still in production when the sensor readings were collected).

**Context sources:**

| Context Type | Source | Persistence |
|--------------|--------|-------------|
| Equipment identity | Equipment registry (PostgreSQL) | Static (changes via MOC) |
| Batch/lot association | MES adapter, batch tracker | Semi-static (per production run) |
| Operating mode | SCADA/PLC adapter, mode detector | Dynamic (changes during production) |
| Shift/crew | Schedule system, shift tracker | Semi-static (per shift change) |
| Material genealogy | ERP adapter, lot tracker | Static per lot, linked via graph |
| Recipe/setpoints | MES/recipe manager adapter | Semi-static (per batch) |
| Maintenance state | CMMS adapter | Dynamic (work orders, PM status) |

### Schema Registry

The Schema Registry is the single source of truth for all data contracts in the platform. Every adapter, every data product, and every API must register its schema and respect version compatibility rules.

**Compatibility modes:**
- **BACKWARD** — new schema can read data written by old schema (default for data products)
- **FORWARD** — old schema can read data written by new schema
- **FULL** — both backward and forward compatible
- **NONE** — no compatibility guarantee (development only)

**Schema types:**
- **Adapter output schemas** — what each adapter produces
- **Data product schemas** — curated, decision-ready datasets
- **API schemas** — OpenAPI/GraphQL specifications
- **Event schemas** — Kafka topic message formats
- **Governance schemas** — FxTS spec formats

---

## 7. Curation Layer

### From Raw Data to Decision-Ready Information

Raw data from adapters is not yet useful for decision-making. It needs to be normalized, contextualized, deduplicated, aggregated, and assembled into coherent **data products** that preserve the structure required for sound inference.

The Curation Service transforms raw contextual records into data products.

### Data Products

A **data product** is a governed dataset or service that preserves the metadata, lineage, time alignment, and operating context needed for correct business interpretation. It has:

- **A clear owner** — a person or team accountable for quality and relevance
- **A registered schema** — versioned, compatible, queryable
- **Quality rules** — FQTS specs that are continuously evaluated
- **Lineage** — traceable from the data product back to source adapters and raw records
- **Context preservation** — normalization factors, operating mode, batch context, etc.
- **Access controls** — RBAC/ABAC policies governing who can read/write
- **SLOs** — freshness, completeness, and latency targets

### Normalization

One of the most critical functions of the Curation Service. Raw data from different systems uses different units, different definitions, different time alignments, and different normalization conventions. Without normalization, aggregation and comparison produce misleading results (Simpson's Paradox, as described in BBD Part 1).

**Normalization dimensions:**

| Dimension | Problem | Solution |
|-----------|---------|----------|
| **Units** | Same measurement in different units (°F vs °C, gallons vs liters) | Canonical unit registry, conversion at ingestion or curation |
| **Definitions** | "Yield" means different things in different departments | Enterprise term glossary with versioned definitions |
| **Time alignment** | Different systems sample at different rates and offsets | Time-bucketing, interpolation, alignment to common grid |
| **Operating mode** | Comparing startup data to steady-state data | Mode tagging, mode-aware aggregation |
| **Material basis** | Comparing yield without normalizing for feedstock quality | Dry-solids normalization, composition-adjusted calculations |
| **Equipment context** | Comparing equipment without accounting for age, condition, configuration | Equipment profile normalization, condition-adjusted baselines |

### Materialized Views and Continuous Aggregation

For high-frequency data (sensor readings at 1-10 second intervals), raw storage at full resolution is maintained in TimescaleDB, but decision-making typically requires aggregated views. The Curation Service manages continuous aggregation using TimescaleDB's native continuous aggregate feature:

- **1-minute aggregates** — min, max, mean, std, count, quality summary
- **15-minute aggregates** — same plus trend direction, alarm summary
- **1-hour aggregates** — same plus batch-context summary, shift totals
- **Daily aggregates** — production summaries, quality reports, KPI calculations

---

## 8. Serving Layer

### API Architecture

All data access goes through versioned APIs. No consuming application connects directly to storage engines.

| Protocol | Use Case | Technology |
|----------|----------|------------|
| **REST** | Standard CRUD, data product access, admin operations | FastAPI (Python) with OpenAPI 3.1 |
| **GraphQL** | Complex queries, cross-entity joins, portal data fetching | NestJS (TypeScript) with Apollo Federation |
| **gRPC** | High-performance internal service communication | Protocol Buffers, Python + Node.js stubs |
| **Streaming** | Real-time data feeds, CDC, event notifications | Kafka Connect, WebSocket, SSE |
| **Webhooks** | External system notifications, integration triggers | HTTP callbacks with retry and DLQ |

### Query Federation

Consuming applications should not need to know which storage engine holds which data. The Query Federation service provides a unified query interface that routes queries to the appropriate engine(s) and assembles results.

**Example:** A quality investigation query might need:
- Sensor data from TimescaleDB (process temperatures during the batch)
- Batch context from PostgreSQL (recipe, material lot, operator)
- Equipment topology from Neo4j (upstream/downstream dependencies)
- Previous investigation documents from MinIO

The federation layer handles this transparently, returning a unified response with cross-referenced context.

### User-Facing Modules (NestJS + NextJS)

Modules that require robust user interfaces — data exploration portals, decision support workflows, admin consoles, and operational dashboards — are built with NestJS (backend-for-frontend) and NextJS (React SSR frontend).

**Key portal modules:**

| Module | Purpose | Technology |
|--------|---------|------------|
| **Data Explorer** | Browse data products, run ad-hoc queries, visualize time-series | NextJS + Recharts/Plotly |
| **Governance Console** | Manage FxTS specs, review quality reports, audit lineage | NextJS + NestJS |
| **Decision Support** | Structured challenge workflows, assumption tracking, risk review | NextJS + NestJS |
| **Adapter Manager** | Register, configure, monitor, and troubleshoot adapters | NextJS + NestJS |
| **Admin Console** | User management, RBAC, system configuration, health overview | NextJS + NestJS |

---

## 9. Decision Support Layer

### Operationalizing the BBD Framework

The BBD papers (Part 1 and Part 2) establish that decision quality degrades from two sources: incomplete information and undisciplined human judgment. The Data Collection, Governance, Storage, Curation, and Serving layers address the information problem. The Decision Support layer addresses the judgment problem.

This layer embeds the BBD Part 2 "minimum decision frame" directly into operational workflows.

### Structured Challenge Workflow

For significant decisions (capital allocation, process changes, root-cause conclusions, vendor selection, quality dispositions), the platform provides a structured challenge workflow that implements the 13-point minimum decision frame:

| Step | BBD Reference | What the System Does |
|------|---------------|----------------------|
| **I. Define scope** | "Decision or issue under review" | Structured form: what is being decided, why now, who is affected |
| **II. Current hypothesis** | "Current working hypothesis" | Free-text with required evidence links to data products |
| **III. Supporting evidence** | "Evidence supporting" | Links to specific data records, queries, visualizations |
| **IV. Challenging evidence** | "Evidence challenging" | **Required field** — system will not advance without at least one entry |
| **V. Alternative hypotheses** | "At least two other plausible explanations" | Minimum 2 alternatives required for material decisions |
| **VI. Key assumptions** | "Assumptions treated as true" | Explicit list, each tagged with confidence level |
| **VII. Missing information** | "Data that would reduce uncertainty" | Links to data gaps, pending tests, unavailable context |
| **VIII. Risk if wrong** | "Risk if current hypothesis is wrong" | Structured risk assessment (likelihood × impact) |
| **IX. Opportunity if right** | "Opportunity if correct" | Quantified upside of correct action |
| **X. Existing controls** | "Controls that should detect/contain" | Links to actual control records, not just names |
| **XI. Evidence of effectiveness** | "Evidence controls are effective" | **Required** — "control exists" is not evidence of effectiveness |
| **XII. Reassessment trigger** | "What triggers re-evaluation" | Specific metric, threshold, date, or event |
| **XIII. Owner** | "Who is accountable" | Named individual, not a department |

### Assumption Tracking

Every assumption recorded in a decision workflow becomes a tracked entity with:

- **Status:** active, validated, invalidated, superseded
- **Confidence:** high / medium / low (with evidence links)
- **Owner:** who is responsible for validating or monitoring
- **Reassessment date:** when this assumption should be reviewed
- **Linked decisions:** which decisions depend on this assumption being true

When new data arrives that contradicts an active assumption, the system generates an alert to the assumption owner and to the owners of all linked decisions.

### Context-Before-Conclusion Enforcement

For reports and dashboards that compare entities (plants, shifts, operators, products, suppliers), the platform enforces normalization before comparison. This directly addresses Simpson's Paradox:

- Comparisons must declare normalization basis (or explicitly acknowledge "unnormalized")
- Aggregate views link to the segmented views beneath them
- Base rates are displayed alongside event rates
- Operating conditions are visible alongside performance metrics

---

## 10. Security & Compliance

### Zero Trust Architecture

| Control | Implementation |
|---------|----------------|
| **Identity** | WorkOS AuthKit: SSO (OIDC/SAML), SCIM directory sync, MFA required for all human access |
| **Authorization** | RBAC progressing to FGA (resource-hierarchical via WorkOS), scope-based API access, row-level security where applicable |
| **Network** | Micro-segmentation, mutual TLS between services, no implicit trust |
| **Audit** | Immutable audit trail for all data access, governance changes, and decisions |
| **Secrets** | Vault-based secret management, no secrets in code or config files |
| **Supply chain** | SBOMs, signed container images, dependency scanning |

### Regulatory Compliance

| Requirement | How Forge Supports It |
|-------------|----------------------|
| **21 CFR Part 11** | E-signatures, audit trails, version control, access control, data integrity |
| **ISO 9001 / ISO 22000** | Documented information control, traceability, corrective action linkage |
| **ISO 27001** | Information security controls, access management, audit logs (via WorkOS), incident response |
| **ISO 42001** | AI management system: model governance, risk assessment, transparency, human oversight |
| **ISO 14001 / ISO 45001** | Environmental and occupational safety data tracking, compliance evidence collection |
| **GDPR / Privacy** | PII classification, data retention policies, right to deletion, anonymization |
| **SOX (if applicable)** | Financial data segregation, access controls, change audit |

### Data Classification

All data in Forge is classified at ingestion:

| Level | Description | Controls |
|-------|-------------|----------|
| **Public** | Non-sensitive, shareable externally | Standard access controls |
| **Internal** | Business-sensitive, internal use only | Authentication required, audit logged |
| **Confidential** | Trade secrets, PII, financial data | Encryption at rest + in transit, need-to-know access, enhanced audit |
| **Restricted** | Regulated data (21 CFR Part 11, PII) | All Confidential controls + retention policies, e-signatures |

---

## 11. Observability

### OpenTelemetry Integration

Every Forge service emits structured telemetry via OpenTelemetry:

| Signal | What It Captures | Destination |
|--------|-----------------|-------------|
| **Metrics** | Request rates, latency, error rates, queue depths, data freshness | Prometheus → Grafana |
| **Logs** | Structured JSON logs with trace context | Loki → Grafana |
| **Traces** | Distributed traces across services, adapters, and storage engines | Tempo → Grafana |

### SLOs (Service Level Objectives)

| SLO | Target | Measurement |
|-----|--------|-------------|
| **Data freshness** | Sensor data available in ≤5s from source event | Ingestion latency p99 |
| **API availability** | 99.9% success rate for read endpoints | Error rate over rolling 30d |
| **Query latency** | p95 ≤ 500ms for standard data product queries | Response time histogram |
| **Adapter health** | All production adapters in HEALTHY state ≥99.5% | Health check pass rate |
| **Governance compliance** | 100% of production data products pass FQTS specs | FxTS runner results |
| **Lineage completeness** | 100% of data products have complete lineage chains | FLTS runner results |

### Key Dashboards

| Dashboard | Purpose | Audience |
|-----------|---------|----------|
| **Platform Overview** | Service health, adapter status, data flow rates | Operations, SRE |
| **Data Quality** | FQTS results, freshness, completeness, anomalies | Data stewards, QA |
| **Adapter Monitor** | Per-adapter health, throughput, error rates, backlog | Integration team |
| **Decision Audit** | Decision workflow status, assumption tracking, open reviews | Leadership, compliance |
| **Performance** | Latency, throughput, resource utilization, capacity | Engineering |

---

## 12. Technology Stack

### Full Bill of Materials

| Layer | Component | Technology | Version | Notes |
|-------|-----------|------------|---------|-------|
| **Core Services** | API, Governance, Context, Storage, Curation | Python 3.12+ (FastAPI) | Latest stable | UV for dependency management, Ruff for linting |
| **User-Facing Modules** | Portal, Decision Support, Admin | NestJS + NextJS | Latest LTS | TypeScript, React, SSR, Apollo GraphQL |
| **CLI** | Developer and operator tooling | Python 3.12+ (Typer) | Latest stable | Subcommands: init, adapter, governance, data, test |
| **Message Broker** | Event-driven data flow | Apache Kafka | 3.x | KRaft mode (no ZooKeeper), Schema Registry |
| **Time-Series DB** | Sensor data, process metrics | TimescaleDB | 2.x | PostgreSQL extension, continuous aggregates |
| **Relational DB** | Master data, governance, transactions | PostgreSQL | 16+ | JSONB, row-level security, logical replication |
| **Graph DB** | Equipment topology, genealogy, flows | Neo4j | 5.x | Community edition, vector indexes, APOC |
| **Object Store** | Documents, blobs, exports | MinIO | Latest | S3-compatible, versioning, lifecycle policies |
| **Cache** | Real-time state, rate limiting | Redis | 7.x | Streams, pub/sub, Lua scripting |
| **Observability** | Metrics, logs, traces | OpenTelemetry + Grafana | Latest | Prometheus, Loki, Tempo |
| **Container** | Service orchestration | Docker Compose (dev) / K8s (prod) | Latest | Helm charts for production deployment |
| **CI/CD** | Build, test, deploy | GitHub Actions | N/A | FxTS runners in CI pipeline |
| **FxTS Runners** | Governance spec execution | Python 3.12+ | N/A | Shared runner infrastructure |

### Development Tooling

| Tool | Purpose |
|------|---------|
| **UV** | Python package management (fast, PEP 723) |
| **Ruff** | Python linting and formatting |
| **pnpm** | Node.js package management (for NestJS/NextJS modules) |
| **ESLint + Prettier** | TypeScript linting and formatting |
| **Docker Compose** | Local development stack |
| **pytest** | Python test framework |
| **Jest** | TypeScript test framework |

---

## 13. Deployment Architecture

### Development (Docker Compose)

```yaml
services:
  forge-gateway:       # Python FastAPI — API gateway
  forge-registry:      # Python FastAPI — Schema registry
  forge-governance:    # Python FastAPI — FxTS governance engine
  forge-context:       # Python FastAPI — Context engine
  forge-storage:       # Python FastAPI — Storage orchestrator
  forge-curation:      # Python FastAPI — Curation service
  forge-decision:      # NestJS — Decision support backend
  forge-portal:        # NextJS — User-facing portal
  forge-observer:      # Python — Telemetry collector
  postgresql:          # Relational + governance state
  timescaledb:         # Time-series data
  neo4j:               # Graph data
  redis:               # Cache + state
  minio:               # Object storage
  kafka:               # Message broker
  grafana:             # Dashboards
  otel-collector:      # OpenTelemetry collector
```

The `forge init` command (adapted from MDEMG's `mdemg init`) generates `.env` with dynamic port allocation, writes `docker-compose.yml` from embedded template, and starts all services with health check verification.

### Production (Kubernetes)

Production deployments use Helm charts with:
- StatefulSets for databases (PostgreSQL, TimescaleDB, Neo4j)
- Deployments for stateless services (gateway, registry, governance, etc.)
- HPA (Horizontal Pod Autoscaler) for API and curation services
- Network policies for micro-segmentation
- PVCs for persistent storage
- Ingress controller with TLS termination

---

## 14. Success Metrics

How we will know Forge is working:

| Metric | Measurement | Target |
|--------|-------------|--------|
| **Reduced reconciliation time** | Hours spent reconciling data across departments | 50% reduction in Y1 |
| **Faster root-cause analysis** | Time from anomaly detection to root cause identification | 60% reduction in Y1 |
| **Decision quality** | Percentage of significant decisions using structured challenge workflow | >80% by Y2 |
| **Data freshness** | Time from source event to availability in data product | <5s for OT, <60s for MES, <5min for ERP |
| **Context preservation** | Percentage of data products with complete operational context | >95% by Y1 |
| **Governance compliance** | Percentage of production data products passing all FxTS specs | 100% (enforced) |
| **Adapter coverage** | Percentage of production data sources connected via adapters | >90% by Y2 |
| **Assumption tracking** | Percentage of tracked assumptions that are reviewed by reassessment date | >90% |
| **Trust in data** | Survey: "I trust the data I use to make decisions" | Increase by 30% in Y1 |

---

## 15. What This Is — and What It Is Not

**Forge is** a modular manufacturing decision infrastructure platform. It connects, governs, and curates data from domain-specific systems (WMS, MES, ERP, CMMS, etc.) to enable better business decisions.

**For most spoke systems, Forge does not replace them.** WHK's production WMS (507K LOC), MES (50+ models), CMMS, and ERP Connector continue to operate as domain applications. Forge connects them through adapters, governs the data flows between them, and makes their combined context available for better decisions.

**For certain vendor-locked systems, Forge does replace them.** When an existing system cannot meet Forge's integration, governance, or extensibility requirements — and the cost of adapting it exceeds the cost of replacement — Forge builds a native module. Two replacements are planned:

- **Ignition SCADA/HMI → Forge OT Module** — Ignition's gateway-centric architecture, Jython scripting limitation, and lack of spec-first governance make it unsuitable as the long-term OT interface. The OT Module provides direct PLC connectivity, eliminating the gateway dependency.
- **Intellect QMS → Forge QMS Module** — Intellect's HTTP Basic Auth, absence of event systems, and $19k+/year licensing make it unsuitable for cross-module compliance workflows. The QMS Module provides native document control, CAPA, and GRC within the Forge ecosystem.

**Forge is not:**

- **A dashboard platform.** Dashboards are consuming applications that sit on top of Forge. Forge provides the governed data products they need; it does not compete with BI tools.
- **An AI/ML platform.** AI and ML models are consuming applications that access Forge's data products via APIs. Forge provides the context-rich, governed training data they need; it does not manage model lifecycle.
- **A data lake.** Forge is a governed data platform with strict schema, quality, and lineage requirements. It is the opposite of "dump everything into a lake and figure it out later."

---

*This document is a living design. It will evolve as implementation reveals what works and what needs adjustment. The principles are durable; the specifics are expected to iterate.*

**Document Owner:** reh3376
**Version:** 0.2 — April 2026 (aligned with WHK Digital Strategy v4r0)
