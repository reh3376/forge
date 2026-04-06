# Forge Platform — Master Development Plan

**Working Name:** Forge (Manufacturing Decision Infrastructure Platform)
**Created:** 2026-04-05
**Owner:** reh3376
**Status:** PLANNING

---

## 0. Executive Context

### What This Is
An industry-general, hub-and-spoke modular data infrastructure platform for manufacturing that **collects, governs, stores, curates, and serves data** from the systems that generate it (PLC, SCADA, HMI, MES, WMS, IMS, QMS, ERP, Historian) and serves it back out to those systems and monitoring/observability platforms as they need it.

### Why It Exists
Manufacturing enterprises make **confidently wrong decisions** because data is fragmented across dozens of systems. No single system preserves the full context needed for sound inference. The cost is recurring and distributed: yield loss, misdirected root-cause analysis, manual reconciliation, excess inventory, expedites, and erosion of trust in data. (See: BBD Papers Part 1 & Part 2, WHK Digital Strategy 2026-v3r1.)

### What Makes It Novel
1. **Decision-quality as primary design objective** — not data movement or dashboards
2. **Context preservation as a first-class architectural concern** — data travels with operational context (batch, lot, shift, equipment, recipe, operating mode)
3. **Specification-first governance and instantiation (FxTS)** — adapted from MDEMG's UxTS framework. Specs DEFINE what must exist; implementation conforms; runners enforce; CI gates block deviation. The spec is the source of truth, not the code.
4. **Structured challenge embedded in workflows** — the BBD Part 2 decision framework operationalized in software
5. **Manufacturing-native semantics** — understands batch/lot/shift/equipment/recipe/material genealogy
6. **Open, composable, non-lock-in** — build→compose→buy, standards-based APIs, no vendor coupling
7. **Edge-first, hub-governed** — transform close to source, govern at center
8. **Human-in-the-loop by design** — systems support judgment, don't replace it

### Relationship to MDEMG
MDEMG is the **developer's cognitive substrate** — the tool used by developers to build Forge. MDEMG is NOT a component of Forge. Forge is the much larger product that MDEMG helps create. Architectural patterns from MDEMG (UxTS governance, plugin system, pipeline registry, multi-stage retrieval, Docker Compose composition) serve as proven design inspirations adapted to a different domain.

### Existing Production Systems (WHK)
WHK already has base versions of key spoke systems in production:

| System | Repo | Status | Notes |
|--------|------|--------|-------|
| **WMS** (Warehouse Management) | `https://github.com/WhiskeyHouse/whk-wms.git` | Production | 507K LOC TypeScript |
| **MES** (Manufacturing Execution) | `https://github.com/WhiskeyHouse/whk-mes.git` | Production | Base version |

These are the **first integration targets** for Forge adapters. Forge does not replace them — it connects to them, governs the data flows between them, and makes their combined context available for better decisions. The WHK deployment is the reference implementation for an industry-general platform.

### Design Principles (from WHK Digital Strategy)
1. Decision quality first
2. Data ownership and openness
3. Integration first
4. Build → Compose → Buy
5. Edge-driven, hub-governed
6. Context before conclusion
7. Human judgment, structured challenge
8. Security by design
9. Continuous improvement

---

## 1. Deliverable Sequence

The work produces three deliverables, each building on the previous:

| # | Deliverable | Format | Purpose |
|---|-------------|--------|---------|
| **D1** | Strategic Architecture Document | Markdown (→ docx) | Define philosophy, component architecture, data flows, governance model, integration patterns |
| **D2** | Phased Development Plan | Markdown | Sprint-style roadmap with phases, dependencies, gates, success criteria |
| **D3** | Project Scaffold | Python project | Working starting point with core interfaces, adapter framework, governance specs, CLI |

---

## 2. Architecture Overview (Pre-Design Summary)

### Hub Services (Core Platform)

| Service | Purpose | Tech Stack |
|---------|---------|------------|
| **API Gateway** | Unified entry, auth, rate limiting, routing | Python (FastAPI) + NGINX |
| **Schema Registry** | Data contracts, versioning, compatibility checks | Python + PostgreSQL |
| **Governance Engine** | Ownership, quality rules, lineage tracking, FxTS | Python + PostgreSQL |
| **Message Broker** | Event-driven data flow, CDC, pub/sub | Kafka or RabbitMQ |
| **Context Engine** | Attach/preserve operational context on all data | Python + Redis |
| **Storage Orchestrator** | Route data to appropriate storage engines | Python |
| **Query Federation** | Cross-engine query capability | Python (GraphQL federation) |
| **Curation Service** | Data products, normalization, materialized views | Python + dbt-core |
| **Decision Support** | Structured challenge workflows, assumption tracking | NestJS + NextJS (user-facing) / Python (engine) |
| **Observability** | Metrics, logs, traces, dashboards | OpenTelemetry + Grafana |
| **Portal / UI Modules** | User-facing dashboards, admin, data exploration | NextJS (React SSR) + NestJS (BFF) |

### Spoke Adapters (Plugin Architecture)

| Tier | Systems | Protocols |
|------|---------|-----------|
| **OT** | PLC, SCADA, HMI, Historian | OPC UA, MQTT Sparkplug B, Modbus TCP, EtherNet/IP |
| **MES/QMS/WMS** | MES, QMS, WMS, LIMS, CMMS, EBR | REST, SOAP, JDBC/ODBC, file-based |
| **ERP/Business** | ERP, SCM, CRM, PLM, BI | REST, OData, RFC/BAPI (SAP), JDBC |

### Storage Engines

| Engine | Data Type | Technology |
|--------|-----------|------------|
| **Time-Series** | Sensor data, process variables, metrics | TimescaleDB |
| **Relational** | Master data, transactions, quality records, config | PostgreSQL |
| **Graph** | Equipment topology, material genealogy, process flows | Neo4j |
| **Object** | Documents, images, blobs, certificates | MinIO (S3-compatible) |
| **Cache** | Real-time state, hot data, session state | Redis |

### Governance Framework (FxTS — Forge x Test Specification)

Adapted from MDEMG's UxTS pattern. 4-layer structure: Schema → Specs → Runner → CI Gate.

| Framework | Scope | Equivalent MDEMG Framework |
|-----------|-------|---------------------------|
| **FATS** (Forge API Test Spec) | API contract instantiation — specs DEFINE endpoints, implementation conforms | UATS |
| **FDTS** (Forge Data Test Spec) | Data contract/schema verification | UDTS |
| **FQTS** (Forge Quality Test Spec) | Data quality rules verification | (new — no MDEMG equivalent) |
| **FLTS** (Forge Lineage Test Spec) | Lineage integrity verification | (new) |
| **FNTS** (Forge Normalization Test Spec) | Unit/definition consistency | UNTS (adapted) |
| **FSTS** (Forge Security Test Spec) | Security/compliance controls | USTS |
| **FOTS** (Forge Observability Test Spec) | Pipeline health, freshness, latency | UOBS/UOTS |
| **FPTS** (Forge Performance Test Spec) | Throughput/latency benchmarks | UBTS |
| **FACTS** (Forge Adapter Conformance Test Spec) | Adapter output schema validation | UPTS (adapted) |

---

## 3. Plan Phases — D1: Strategic Architecture Document

### Phase D1.1: Foundation Sections
**Estimated effort:** Medium
**Depends on:** Research (complete)

Write the following sections of the architecture document:
- [ ] Vision & Problem Statement (from BBD papers)
- [ ] Design Philosophy (from WHK DS principles + MDEMG patterns)
- [ ] Core Architecture Overview (hub-and-spoke diagram, service inventory)
- [ ] Technical Invariants (non-negotiable architectural rules, like MDEMG's)

### Phase D1.2: Data Flow Architecture
**Estimated effort:** Medium
**Depends on:** D1.1

Write the following sections:
- [ ] Data Collection Layer — adapter framework, plugin architecture, manifest pattern
- [ ] Governance Layer — FxTS framework design, schema registry, lineage model
- [ ] Storage Layer — multi-engine strategy, data routing rules
- [ ] Context Engine — how operational context is preserved and attached

### Phase D1.3: Serving & Decision Support
**Estimated effort:** Medium
**Depends on:** D1.2

Write the following sections:
- [ ] Curation Layer — data products, normalization, materialized views
- [ ] Serving Layer — APIs (REST/GraphQL/gRPC), streaming, subscriptions
- [ ] Decision Support Layer — structured challenge workflows, assumption tracking
- [ ] Integration Patterns — how Forge connects to existing systems

### Phase D1.4: Cross-Cutting Concerns
**Estimated effort:** Medium
**Depends on:** D1.3

Write the following sections:
- [ ] Security & Compliance (Zero Trust, 21 CFR Part 11, audit trails)
- [ ] Observability (OpenTelemetry, Grafana, SLOs)
- [ ] Technology Stack (full bill of materials)
- [ ] Deployment Architecture (Docker Compose, K8s, edge)
- [ ] Success Metrics & KPIs

### Phase D1.5: Review & Refine
**Estimated effort:** Small
**Depends on:** D1.4

- [ ] Internal consistency check across all sections
- [ ] Verify alignment with WHK Digital Strategy principles
- [ ] Verify BBD paper arguments are operationalized in the design
- [ ] Produce final markdown + optional docx conversion

---

## 4. Plan Phases — D2: Phased Development Plan

### Phase D2.1: Phase Registry Design
**Estimated effort:** Medium
**Depends on:** D1 complete

- [ ] Define phase numbering convention (adapted from MDEMG pattern)
- [ ] Identify implementation phases with dependencies
- [ ] Define gates between phases (what must be true to proceed)
- [ ] Map phases to FxTS governance specs

### Phase D2.2: Phase Detail
**Estimated effort:** Medium
**Depends on:** D2.1

- [ ] Write phase specifications (scope, success criteria, deliverables)
- [ ] Define testing strategy per phase (FxTS specs required)
- [ ] Identify MVP milestone (minimum viable platform)
- [ ] Create dependency graph

### Phase D2.3: Timeline & Resources
**Estimated effort:** Small
**Depends on:** D2.2

- [ ] Estimate effort per phase
- [ ] Identify parallelizable work
- [ ] Define release milestones (v0.1, v0.2, v1.0)
- [ ] Document risks and mitigations

---

## 5. Plan Phases — D3: Project Scaffold

### Phase D3.1: Project Structure
**Estimated effort:** Medium
**Depends on:** D2 complete

- [ ] Create Python project with UV (pyproject.toml, src layout)
- [ ] Set up Ruff linting configuration
- [ ] Create directory structure matching architecture
- [ ] Define core interfaces (Adapter, GovernanceSpec, StorageEngine, etc.)
- [ ] Create CLI framework (Click or Typer)

### Phase D3.2: Core Interfaces & Types
**Estimated effort:** Medium
**Depends on:** D3.1

- [ ] Define adapter plugin interface (manifest, lifecycle, data contract)
- [ ] Define FxTS spec schema (JSON Schema for governance specs)
- [ ] Define data models (observation, context, lineage, data product)
- [ ] Define service interfaces (schema registry, governance engine, context engine)

### Phase D3.3: First FxTS Framework
**Estimated effort:** Medium
**Depends on:** D3.2

- [ ] Implement FACTS (Adapter Conformance) schema + runner
- [ ] Create example adapter spec
- [ ] Implement FATS (API Test) schema + runner
- [ ] Wire into CLI (`forge test` commands)

### Phase D3.4: Example Adapter
**Estimated effort:** Small
**Depends on:** D3.3

- [ ] Create example OPC UA adapter plugin (stub/mock)
- [ ] Create example MQTT Sparkplug B adapter plugin (stub/mock)
- [ ] Demonstrate full adapter lifecycle: discover → connect → collect → validate → publish
- [ ] Verify against FACTS spec

### Phase D3.5: Docker Compose
**Estimated effort:** Small
**Depends on:** D3.4

- [ ] Create docker-compose.yml for development stack
- [ ] Include: forge-api, PostgreSQL, TimescaleDB, Neo4j, Redis, Grafana
- [ ] Create `forge init` command (adapted from `mdemg init` pattern)
- [ ] Health checks and dependency ordering

### Phase D3.6: Verification
**Estimated effort:** Small
**Depends on:** D3.5

- [ ] Run all FxTS specs against scaffold
- [ ] Verify CLI commands work end-to-end
- [ ] Verify Docker Compose stack starts and passes health checks
- [ ] Run Ruff linting (zero issues)
- [ ] Document what exists and what's next

---

## 6. Execution Order

```
Research (COMPLETE)
    │
    ▼
D1: Architecture Document
    │
    ├─ D1.1: Foundation ──► D1.2: Data Flow ──► D1.3: Serving ──► D1.4: Cross-Cutting ──► D1.5: Review
    │
    ▼
D2: Development Plan
    │
    ├─ D2.1: Phase Registry ──► D2.2: Phase Detail ──► D2.3: Timeline
    │
    ▼
D3: Project Scaffold
    │
    ├─ D3.1: Structure ──► D3.2: Interfaces ──► D3.3: FxTS ──► D3.4: Adapter ──► D3.5: Compose ──► D3.6: Verify
```

---

## 7. Key Decisions (Requiring User Input)

| # | Decision | Options | Current Assumption |
|---|----------|---------|-------------------|
| K1 | Platform working name | Forge, other | **Forge** |
| K2 | Primary language | Python, Go, mixed | **Polyglot:** Python (core services, CLI, ML, FxTS runners), TS/JS with NestJS+NextJS (user-facing modules, portals, robust frontends) |
| K3 | Message broker | Kafka, RabbitMQ, NATS | **Kafka** (industry standard for manufacturing) |
| K4 | Time-series DB | TimescaleDB, InfluxDB, QuestDB | **TimescaleDB** (proven in MDEMG) |
| K5 | Graph DB | Neo4j, ArangoDB, TigerGraph | **Neo4j** (proven in MDEMG) |
| K6 | API framework | FastAPI, Flask, Django | **FastAPI** (async, OpenAPI native) |
| K7 | CLI framework | Click, Typer, argparse | **Typer** (modern, type-hint driven) |
| K8 | Governance spec format | JSON, YAML, TOML | **JSON** (consistent with UxTS pattern) |
| K9 | Container orchestration | Docker Compose (dev), K8s (prod) | **Both** (compose for dev, K8s ready) |
| K10 | License model | Proprietary, AGPL, Apache 2.0, BSL | **TBD** (commercial intent) |

---

## 8. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Scope creep during architecture | High | High | Plan enforces phase gates; each deliverable is self-contained |
| Context compaction loses plan state | Medium | Medium | Plan persisted to disk; PLAN.md is the recovery document |
| Technology choices constrain future | Medium | Low | Interface-first design; all components pluggable |
| Adapter complexity varies wildly per system | High | High | Adapter interface is minimal; complexity lives in adapter implementations |
| FxTS framework too rigid or too loose | Medium | Medium | Start with 2-3 frameworks, iterate governance based on real usage |

---

## 9. Recovery Protocol

If context is lost (compaction, new session, crash):

1. Read this file: `mnt/Digital Strategy/forge-platform/PLAN.md`
2. Read the architecture doc (when written): `mnt/Digital Strategy/forge-platform/ARCHITECTURE.md`
3. Read the phase plan (when written): `mnt/Digital Strategy/forge-platform/PHASES.md`
4. Check auto-memory: `mnt/.auto-memory/MEMORY.md`
5. Check project scaffold state: `mnt/Digital Strategy/forge-platform/src/`
6. Resume from the last completed phase marker in this document

---

## 10. Phase Completion Tracking

### D1: Architecture Document
- [ ] D1.1: Foundation Sections
- [ ] D1.2: Data Flow Architecture
- [ ] D1.3: Serving & Decision Support
- [ ] D1.4: Cross-Cutting Concerns
- [ ] D1.5: Review & Refine

### D2: Development Plan
- [ ] D2.1: Phase Registry Design
- [ ] D2.2: Phase Detail
- [ ] D2.3: Timeline & Resources

### D3: Project Scaffold
- [ ] D3.1: Project Structure
- [ ] D3.2: Core Interfaces & Types
- [ ] D3.3: First FxTS Framework
- [ ] D3.4: Example Adapter
- [ ] D3.5: Docker Compose
- [ ] D3.6: Verification

---

*This plan is the single source of truth for the Forge platform development effort. Update completion markers as work progresses. All deliverables are saved to `mnt/Digital Strategy/forge-platform/`.*
