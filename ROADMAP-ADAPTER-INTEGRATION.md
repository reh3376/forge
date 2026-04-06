# Forge Platform — Adapter Integration Roadmap

**Created:** 2026-04-06
**Owner:** reh3376
**Status:** PLANNING
**Context:** With whk-wms and whk-mes now available as local template repos, this document roadmaps three convergent workstreams that connect Forge to its first production spoke systems.

---

## Strategic Context

Forge's PLAN.md identifies whk-wms and whk-mes as the **first integration targets**. Both are production TypeScript monorepos (NestJS + Next.js + Prisma + GraphQL) sharing an almost identical architectural spine. This shared spine is the strongest argument for a generalized adapter framework — if the pattern works for both, it works for any system built on the same stack.

The three paths below are not independent; they are **convergent phases** of a single effort. Path 1 produces the contracts. Path 2 produces the shared vocabulary. Path 3 proves the contracts work against a live system. The order matters: spec-first, then model, then code.

---

## Path 1: FACTS Adapter Specs (WMS + MES)

**Priority:** Highest — this is the spec-first foundation everything else depends on.
**Phase Alignment:** F12 (FACTS framework) → F30 (Adapter Framework Core) → F32/F33 (WHK adapters)
**Effort:** 5 sprints (~2–3 weeks of focused work)
**Deliverables:**

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | `facts.schema.json` | JSON Schema defining what every FACTS spec must contain |
| 2 | `facts_runner.py` | Runner that enforces every schema field against a live or mocked adapter |
| 3 | `whk-wms.facts.json` | FACTS spec for the WMS adapter — manifest, capabilities, data contract, context mapping |
| 4 | `whk-mes.facts.json` | FACTS spec for the MES adapter — same structure, MES-specific data sources |
| 5 | CLI integration | `forge governance run facts --adapter whk-wms` |

**What this unlocks:**
- Formal, diffable contracts for how Forge connects to WMS and MES
- A governance runner that can validate any adapter before it's deployed
- CI gate: no adapter ships without FACTS conformance
- Template for all future adapter specs (OPC UA, Historian, ERP, etc.)

**Full sprint plan follows below this roadmap.**

---

## Path 2: Extract Common Data Models into Forge Core

**Priority:** Medium — feeds directly from Path 1 findings
**Phase Alignment:** F02 (Core Data Models & Schemas)
**Effort:** 3 sprints (~1.5 weeks)
**Deliverables:**

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | Manufacturing entity catalog | Cross-reference of WMS + MES Prisma schemas to identify shared concepts |
| 2 | `forge.core.models` expansion | Pydantic models for shared entities: Lot, Barrel/Container, StorageLocation, ProductionOrder, Recipe, Equipment, Batch, Customer, AuditEvent |
| 3 | `forge.core.schemas` JSON Schemas | JSON Schema definitions for all core models |
| 4 | Context field registry | Canonical list of context fields (batch_id, lot_id, shift_id, equipment_id, recipe_id, operating_mode) with definitions |
| 5 | TypeScript Zod equivalents | `@whk/shared`-style models for the NestJS/NextJS modules |

**Approach:**

Study the Prisma schemas from both repos to extract common patterns:

| WMS Concept | MES Concept | Forge Core Model |
|---|---|---|
| Barrel | Batch | `ManufacturingUnit` (generic container for tracked production units) |
| Lot | Lot | `Lot` (material grouping with traceability) |
| StorageLocation | Asset | `PhysicalAsset` (location or equipment) |
| BarrelEvent | ProductionEvent | `OperationalEvent` (immutable audit trail) |
| Customer | Customer | `BusinessEntity` (customer, vendor, partner) |
| Recipe | Recipe + MashingProtocol | `ProcessDefinition` (how to make something) |
| WarehouseJobs | ScheduleOrderQueue | `WorkOrder` (task assignment) |

**What this unlocks:**
- Adapters produce `ContextualRecord` instances with well-defined, cross-system entity references
- Data products can join WMS + MES data because they share a common vocabulary
- Future adapters for other manufacturing systems map into the same model

---

## Path 3: Build Working WMS Adapter (Vertical Slice)

**Priority:** High — proves the architecture end-to-end
**Phase Alignment:** F30 (Adapter Framework Core) + F32 (WHK WMS Adapter)
**Effort:** 4 sprints (~2 weeks)
**Dependencies:** Path 1 complete (FACTS spec for WMS), Path 2 partially complete (core models)
**Deliverables:**

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | `forge/adapters/whk_wms/manifest.json` | Adapter manifest declaring capabilities, connection params, data contract |
| 2 | `forge/adapters/whk_wms/adapter.py` | Python adapter implementing `AdapterBase` + relevant capability mixins |
| 3 | GraphQL collector | Collects barrel, lot, inventory data via WMS GraphQL API |
| 4 | RabbitMQ subscriber | Subscribes to `wh.whk01.distillery01.*` topics for real-time events |
| 5 | Context mapper | Maps WMS-specific fields to Forge `ContextualRecord` context fields |
| 6 | FACTS conformance | Adapter passes `facts_runner.py` against `whk-wms.facts.json` |
| 7 | Integration tests | Tests against WMS E2E Docker stack (port 3001) |

**Architecture:**

```
whk-wms (Production)
  ├── GraphQL API (:3000/graphql) ──→ WMS Adapter (collect)
  ├── REST API (:3000/*) ──────────→ WMS Adapter (bulk ops)
  └── RabbitMQ (wh.whk01.*) ──────→ WMS Adapter (subscribe)
                                          │
                                    ContextualRecord
                                          │
                                    Forge Hub Pipeline
                                    (governance → storage → curation)
```

**What this unlocks:**
- End-to-end proof that Forge can ingest real production data
- Template for the MES adapter (same pattern, different data sources)
- First data products from combined WMS context

---

## Dependency Graph

```
Path 1: FACTS Specs
  Sprint 1 (Schema) ──→ Sprint 2 (WMS Spec) ──→ Sprint 4 (Runner)
                    ──→ Sprint 3 (MES Spec) ──→ Sprint 4 (Runner)
                                                      │
                                                Sprint 5 (Verify)
                                                      │
Path 2: Core Models ─────────────────────────────────→ │
  (can start in parallel with Sprint 2)                │
                                                      ▼
Path 3: WMS Adapter ────────────────────────── (starts after Path 1 Sprint 5)
  Sprint 6 (Framework) → Sprint 7 (GraphQL) → Sprint 8 (RabbitMQ) → Sprint 9 (Integration)
```

---

## Success Criteria

| Criterion | Measurement |
|---|---|
| FACTS specs are complete and self-consistent | Both specs pass JSON Schema validation against `facts.schema.json` |
| FACTS runner enforces every schema field | Schema-runner parity check passes (0 NOT_IMPLEMENTED verdicts) |
| WMS adapter conforms to its FACTS spec | `forge governance run facts --adapter whk-wms` → all PASS |
| MES spec is ready for adapter development | `whk-mes.facts.json` reviewed and accepted |
| Core models represent shared manufacturing concepts | At least 7 core models with round-trip serialization tests |
| Vertical slice works end-to-end | WMS adapter collects records from WMS E2E Docker stack |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WMS/MES APIs evolve while we write specs | Medium | Low | Specs version-locked; adapter handles version negotiation |
| GraphQL schema too large to spec completely | High | Medium | Spec the adapter's data contract (what it collects), not the full API surface |
| RabbitMQ topic topology undocumented | Low | Medium | Infrastructure definitions file (`definitions.json`) gives us the full topology |
| FACTS schema too rigid for diverse adapters | Medium | High | Design schema with optional capability sections — adapters declare only what they implement |
| Core models over-abstract manufacturing concepts | Medium | Medium | Start concrete (WMS/MES specific), then generalize only what's shared |
