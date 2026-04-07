# Forge — Spoke Onboarding Priority Plan

**Version:** 1.0 — April 2026
**Depends on:** WHK Digital Strategy v4r0, PLAN.md, PHASES.md
**Approval required:** Each spoke compliance plan needs explicit owner approval before implementation begins.

---

## Context

The Forge hub has a proven adapter pattern established through two vertical slices:

- **Path 3 (WMS Adapter):** 9 entity mappers, context builder, record builder, 127 tests
- **Path 4 (MES Adapter):** 11 mapper functions, ISA-88 class/instance pattern, 188 tests
- **Path 5 (gRPC Transport):** Compiled protobuf stubs, `GrpcTransportAdapter` wraps any `AdapterBase` with zero code changes, FTTS governance, 175 tests
- **Path 6 (Curation Service):** Normalization, aggregation, data products, lineage, quality monitoring, 130 tests

Total: 898 tests passing across the scaffold. The pattern is mature enough to onboard additional spokes.

This document defines the priority order, rationale, and acceptance criteria for onboarding the remaining 8 production spokes plus 2 new-build modules.

---

## Priority Scoring

Each spoke is scored across 5 factors (1-5 scale, 5 = highest priority):

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| **Business Value** | 3x | Cross-module decision quality impact, operational urgency |
| **Pattern Fit** | 2x | How closely the existing codebase matches the proven adapter pattern |
| **Integration Readiness** | 2x | Existing RabbitMQ/API integration, data already flowing |
| **Dependency Enablement** | 1x | How many other modules depend on this spoke being onboarded |
| **Effort** | 1x | Inverse of complexity — lower effort = higher score |

---

## Priority Ranking

### Tier 1 — Already Complete

| # | Module | Score | Status | Notes |
|---|--------|-------|--------|-------|
| 5 | **WMS** | — | **COMPLETE** | Path 3. 9 mappers, FACTS spec (48 tests), FTTS compliant. |
| 6 | **MES** | — | **COMPLETE** | Path 4. 11 mappers, FACTS spec (64 tests), FTTS compliant. |

---

### Tier 2 — High Priority (next 3-6 months)

#### Priority 1: ERP Connector (whk-erpi)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 5 | THE single ERP bridge — WMS/MES already route through it. Financial data quality. |
| Pattern Fit | 4 | NestJS 11 + TypeScript, same stack as WMS/MES. REST/GraphQL APIs. |
| Integration Readiness | 5 | **38 RabbitMQ topics already active.** Outbox pattern, bidirectional sync. |
| Dependency Enablement | 5 | Every module that needs ERP data (WMS, MES, CMMS, QMS) depends on ERPI integration. |
| Effort | 4 | Adapter can consume existing RabbitMQ topics directly — much of the transport is already built. |
| **Weighted Total** | **41** | |

**Why first:** ERPI is the backbone of cross-system data flow at WHK. Its 38 RabbitMQ topics are the proto-UNS that connects everything. Onboarding ERPI means Forge can observe (and eventually govern) the richest event stream in the enterprise. The adapter can initially be passive — consuming existing RabbitMQ messages without changing ERPI behavior.

**Approach:**
1. Write FACTS spec from existing RabbitMQ topic documentation
2. Build adapter that subscribes to `wh.whk01.#` topics
3. Map message payloads to ContextualRecord using existing MES adapter patterns
4. No code changes to whk-erpi required in phase 1

**Acceptance criteria:**
- [ ] FACTS spec approved
- [ ] Adapter consuming all 38 RabbitMQ topics
- [ ] ContextualRecords flowing to Forge hub with ERPI context fields
- [ ] FTTS-compliant gRPC transport verified

---

#### Priority 2: CMMS (whk-cmms)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 4 | Maintenance data is critical for equipment context, downtime analysis, PM compliance. |
| Pattern Fit | 5 | NestJS 10, Prisma, PostgreSQL, GraphQL — **identical stack** to WMS/MES adapters. |
| Integration Readiness | 3 | Has REST/GraphQL APIs. Some RabbitMQ integration via ERPI. No dedicated topics yet. |
| Dependency Enablement | 3 | OT Module and QMS both reference equipment/asset data managed by CMMS. |
| Effort | 5 | Smallest codebase, simplest schema (11 Prisma tables). Most straightforward adapter. |
| **Weighted Total** | **36** | |

**Why second:** CMMS is the easiest adapter to build (identical tech stack, small schema, proven pattern) and unlocks equipment context for every other module. Work orders, PM schedules, and asset history are cross-cutting data that enriches WMS, MES, OT, and NMS decisions.

**Approach:**
1. Write FACTS spec from Prisma schema (11 tables) and GraphQL schema
2. Build adapter using WMS adapter as direct template (NestJS → GraphQL → mappers)
3. Add equipment-specific context fields (asset_id, location, maintenance_class)
4. Connect CMMS work order events to Support & PM Orchestration capability

**Acceptance criteria:**
- [ ] FACTS spec approved
- [ ] Adapter pulling from CMMS GraphQL API
- [ ] Equipment context available to enrich WMS/MES records
- [ ] FTTS-compliant gRPC transport verified

---

#### Priority 3: NMS (net-topology)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 4 | Infrastructure visibility, SPOF detection, security events feed compliance. |
| Pattern Fit | 5 | **Python FastAPI** — closest stack to Forge core. Neo4j + TimescaleDB already used. |
| Integration Readiness | 3 | REST API (75+ endpoints), no RabbitMQ yet. PostgreSQL + Neo4j storage. |
| Dependency Enablement | 3 | NMS alerts feed Support/PM Orchestration. Network topology enriches OT context. |
| Effort | 4 | Python-native means adapter runs directly in Forge (no sidecar needed). |
| **Weighted Total** | **35** | |

**Why third:** NMS is the closest tech stack match to Forge core (Python, FastAPI, Neo4j, TimescaleDB). It can be the first spoke where the adapter runs natively inside the hub rather than through a TypeScript sidecar, proving the pattern works for Python-native systems. Network topology data enriches equipment context and feeds security compliance workflows.

**Approach:**
1. Write FACTS spec from existing REST API documentation (75+ endpoints)
2. Build Python-native adapter (no TS sidecar needed)
3. Map device discovery, topology, SNMP metrics, and security events to ContextualRecords
4. Graph data (Neo4j) can sync directly to Forge's Neo4j instance

**Acceptance criteria:**
- [ ] FACTS spec approved
- [ ] Adapter consuming device, topology, and security event APIs
- [ ] Network topology available in Forge graph layer
- [ ] Alert events feeding Support/PM Orchestration

---

### Tier 3 — Medium Priority (6-12 months)

#### Priority 4: Scanner Gateway (whk-wms-android)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 3 | Warehouse scan events complete the WMS picture. |
| Pattern Fit | 2 | Android — needs REST/webhook bridge, not a direct adapter. |
| Integration Readiness | 4 | Spoke adapter already built. Syncs via WMS backend. |
| Dependency Enablement | 1 | Only enriches WMS data. |
| Effort | 5 | Adapter already exists — mostly configuration. |
| **Weighted Total** | **26** | |

**Note:** The Scanner Gateway adapter is already built. Onboarding is primarily configuration and FACTS spec creation, not new development. Can be done opportunistically whenever WMS adapter work is happening.

---

#### Priority 5: NextTrend (nexttrend)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 4 | Time-series historian is the OT data backbone. Process variables, trends, KPIs. |
| Pattern Fit | 2 | Rust + QuestDB — needs ILP/PGWire bridge, different from NestJS pattern. |
| Integration Readiness | 3 | REST API exists. SSE streaming. No RabbitMQ yet. |
| Dependency Enablement | 4 | OT Module and MES both need historian data for process context. |
| Effort | 2 | Rust↔Python bridge needed. QuestDB query integration non-trivial. |
| **Weighted Total** | **27** | |

**Why deferred:** NextTrend is the most architecturally different spoke (Rust, QuestDB). The adapter pattern needs extension for high-throughput time-series streaming that doesn't fit the poll-and-map model. The right approach is likely a dedicated ILP bridge rather than a standard adapter.

**Approach:**
1. Design a time-series-specific adapter pattern (extends AdapterBase but optimized for streaming)
2. Build ILP bridge: NextTrend QuestDB → Forge TimescaleDB (or vice versa)
3. Tag metadata sync via REST API
4. SSE/WebSocket bridge for real-time data flow

---

#### Priority 6: IMS / BOSC IMS (bosc_ims)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 3 | Aerospace inventory tracking, compliance. Niche but critical for BOSC. |
| Pattern Fit | 2 | Go + gRPC — needs Go↔Python bridge or gRPC-to-gRPC relay. |
| Integration Readiness | 3 | gRPC API already exists. Event pipeline via Redpanda. |
| Dependency Enablement | 2 | Relatively standalone — feeds QMS for compliance data. |
| Effort | 3 | Already speaks gRPC+Protobuf — may be easiest gRPC integration. |
| **Weighted Total** | **23** | |

**Why interesting:** IMS already speaks gRPC+Protobuf natively. The adapter may be the simplest transport integration (gRPC spoke ↔ gRPC hub), even though the Go codebase itself is architecturally different. This could validate the "non-Python spoke" adapter pattern.

**Approach:**
1. Map BOSC IMS .proto service definitions to Forge adapter service contract
2. Build gRPC relay (BOSC AdapterService ↔ Forge AdapterService)
3. Python sidecar for data model mapping (BOSC ContextualRecord → Forge ContextualRecord)

---

### Tier 4 — New Builds (12+ months)

#### Priority 7: OT Module (new build)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 5 | Replaces Ignition — THE strategic initiative. |
| Pattern Fit | 5 | Being built for Forge from scratch. |
| Integration Readiness | 1 | Doesn't exist yet. |
| Dependency Enablement | 5 | OT UI Builder and historian integration depend on it. |
| Effort | 1 | Largest new-build effort in the entire platform. |
| **Weighted Total** | **30** | |

**Why new build, not adapter:** The OT Module isn't an adapter to an existing system — it IS the system. It replaces Ignition SCADA with direct PLC connectivity. This is the highest-stakes, longest-horizon module in the Forge roadmap.

**Phases:**
1. OPC-UA Python library hardening (opcua-asyncio fork, L83 v36+ target)
2. Tag acquisition engine (subscription-based, not polling)
3. Alarm engine (ISA-18.2 state machine)
4. Control write interface (with safety interlocks and audit trail)
5. Ignition bridge adapter (migration period — read from Ignition, write to Forge)
6. Progressive Ignition decommission

---

#### Priority 8: QMS Module (new build)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 5 | Document control, CAPA, audits, GRC — mandatory for ISO compliance. |
| Pattern Fit | 5 | Being built for Forge from scratch (NestJS+Next.js). |
| Integration Readiness | 1 | Doesn't exist yet. Reference: intellect-integration-service, iso-planning. |
| Dependency Enablement | 3 | IMS and MES feed compliance data to QMS. |
| Effort | 1 | Large new-build with complex regulatory requirements. |
| **Weighted Total** | **28** | |

**Why new build:** Intellect QMS is $19k+/year, difficult to integrate (HTTP Basic Auth, no event system, brittle REST), and can't support the cross-module compliance workflows Forge needs. The intellect-integration-service (event sourcing, 12 MCP tools) and iso-planning (5-standard IMS, 65 gaps) provide the design reference and requirements scope.

**Phases:**
1. Document management (CRUD, versioning, approval workflows)
2. CAPA management (initiation, investigation, root cause, corrective action, effectiveness review)
3. Audit management (planning, scheduling, findings, tracking)
4. GRC evidence collection (connected to all Forge modules via events)
5. Intellect data migration and decommission

---

#### Priority 9: OT UI Builder (future)

| Factor | Score | Rationale |
|--------|-------|-----------|
| Business Value | 3 | Replaces Ignition Perspective for user-built HMI screens. |
| Pattern Fit | — | Doesn't exist yet. |
| Integration Readiness | 1 | Depends entirely on OT Module. |
| Dependency Enablement | 1 | End-user facing, no downstream dependencies. |
| Effort | 1 | Largest UI effort — drag-and-drop screen builder. |
| **Weighted Total** | **17** | |

**Why last:** The OT UI Builder is a user-facing tool that depends on the OT Module being mature. It replaces Ignition Perspective, which is the most complex Ignition component. This is 2027 work at the earliest.

---

## Onboarding Sequence Summary

```
COMPLETE ─── WMS (Path 3) ─── MES (Path 4)
                                  │
Phase 1 ─── ERP Connector ───────┤  (consume existing RabbitMQ topics)
(Q2 2026)   CMMS ────────────────┤  (identical NestJS stack, equipment context)
            NMS ─────────────────┘  (Python-native, closest stack match)
                                  │
Phase 2 ─── Scanner Gateway ─────┤  (already built, config only)
(Q3 2026)   NextTrend ───────────┘  (Rust bridge, time-series streaming)
                                  │
Phase 3 ─── IMS ─────────────────┘  (gRPC-native, validates non-Python pattern)
(Q4 2026)
                                  │
New Build ─ OT Module ───────────┤  (replaces Ignition, longest horizon)
(2026-27)   QMS Module ──────────┘  (replaces Intellect, regulatory scope)
                                  │
Future ──── OT UI Builder ───────┘  (depends on OT Module maturity)
(2027+)
```

---

## Per-Spoke Onboarding Checklist

Every spoke onboarding follows this checklist:

1. **Approval gate** — Spoke compliance plan reviewed and approved by owner
2. **Discovery** — Document existing APIs, data models, event streams, and auth patterns
3. **FACTS spec** — Write adapter conformance spec BEFORE implementation (spec-first)
4. **Adapter build** — Implement adapter using `AdapterBase` + appropriate mixins
5. **Context builder** — Define spoke-specific context fields and enrichment rules
6. **FTTS compliance** — Verify gRPC transport contract via `GrpcTransportAdapter`
7. **Curation integration** — Define at least one data product consuming spoke data
8. **FQTS quality spec** — Define quality rules and SLOs for spoke data products
9. **Integration test** — Verify end-to-end: spoke → adapter → gRPC → hub → curation → data product
10. **Documentation** — Update PLAN.md, PHASES.md, and spoke-specific README

---

*This document is referenced from PLAN.md Section 11. Each spoke requires explicit approval before implementation begins (see: feedback_spoke_onboarding_approval.md in auto-memory).*
