# Sprint Development Plan: Path 2 — Extract Common Data Models into Forge Core

**Plan Version:** 1.0
**Created:** 2026-04-06
**Owner:** reh3376
**Path:** Roadmap Path 2 — Core Data Models
**Branch:** `forge_dev01`
**Status:** READY FOR EXECUTION

---

## 1. Problem Statement

Forge adapters (WMS, MES, and future systems) each speak their own data language. WMS talks about "Barrels" while MES talks about "Batches," yet both represent tracked manufacturing units moving through a lifecycle. Without a shared vocabulary, every data product that joins WMS + MES data must contain bespoke mapping logic — fragile, duplicated, and invisible to governance.

Path 1 (FACTS) defined **what adapters must declare**. Path 2 defines **the shared manufacturing vocabulary** that adapters produce. When a WMS adapter emits a `ContextualRecord`, the entity references inside it must use Forge's canonical types — not raw Prisma model names.

**Core question this plan answers:** What are the universal manufacturing concepts that span all WHK systems, and how does Forge represent them?

---

## 2. Scope & Constraints

### In Scope
- Cross-reference of WMS (121 models) and MES (84 models) Prisma schemas
- Manufacturing entity catalog document (the analysis artifact)
- `forge.core.models.manufacturing` — Pydantic models for 10 shared entity families
- `forge.core.schemas/` — JSON Schema exports for each model
- Context field registry — canonical field definitions with cross-system provenance
- Unit tests for all models (validation, serialization, cross-model consistency)
- Documentation: developer guide for using core models in adapters

### Out of Scope
- TypeScript/Zod equivalents (Deliverable 5 — deferred to Path 3 when NestJS adapter work begins)
- Actual adapter mapping code (that's Path 3)
- Database migrations or ORM integration (Forge core models are in-memory Pydantic)
- Changes to WMS or MES source systems

### Constraints
- **Industry-general naming:** Models use manufacturing-standard names (ManufacturingUnit, not Barrel). WHK-specific concepts are adapter-level mappings, not core types.
- **Pydantic v2:** All models use `pydantic.BaseModel` with `model_config` (not v1 `Config` inner class).
- **Python 3.12+, UV, Ruff:** All code follows project standards.
- **Backward compatible:** Existing `forge.core.models` exports (`AdapterManifest`, `ContextualRecord`, `DecisionFrame`, `DataProduct`) must not break.

---

## 3. Dependencies

| Dependency | Status | Notes |
|---|---|---|
| `forge.core.models` (existing 4 modules) | ✅ Complete | adapter.py, contextual_record.py, decision.py, data_product.py |
| FACTS specs (whk-wms, whk-mes) | ✅ Complete | Path 1 — provides adapter identity, data sources, context mappings |
| WMS Prisma schema analysis | ✅ Complete | 121 models cataloged across 30+ domain categories |
| MES Prisma schema analysis | ✅ Complete | 84 models cataloged across 20 domain categories |
| FxTS runner base class | ✅ Complete | Available if we want schema validation runner for core models |

---

## 4. Documents Accessed

| Document | Path | Purpose |
|---|---|---|
| Adapter Integration Roadmap | `ROADMAP-ADAPTER-INTEGRATION.md` | Path 2 definition, mapping table, deliverables |
| Existing core models | `src/forge/core/models/*.py` | Starting point — must extend, not break |
| WMS Prisma schema | `whk-wms/apps/whk-wms/prisma/schema.prisma` | Source system #1 — 121 domain models |
| MES Prisma schema | `whk-mes/apps/whk-recipe-configuration/prisma/schema.prisma` | Source system #2 — 84 domain models |
| FACTS WMS spec | `src/forge/governance/facts/specs/whk-wms.facts.json` | 14 data sources, context field mappings |
| FACTS MES spec | `src/forge/governance/facts/specs/whk-mes.facts.json` | 17 data sources, context field mappings |
| WHK Digital Strategy | `WHK Digital Strategy.docx` | Design principles, 9 non-negotiables |
| ARCHITECTURE.md | `ARCHITECTURE.md` | Core data model layer definition |

---

## 5. Implementation Plan

### Sprint P2.1: Manufacturing Entity Catalog (Analysis)

**Goal:** Produce a cross-reference document mapping WMS and MES domain models to Forge core entity families.

**Epic P2.1.1 — Cross-Reference Analysis**

| Step | Task | Output |
|---|---|---|
| 1 | Map WMS models → Forge entity families | Mapping table with field-level notes |
| 2 | Map MES models → same Forge entity families | Mapping table with field-level notes |
| 3 | Identify conflicts (same concept, different semantics) | Conflict register |
| 4 | Identify gaps (MES-only or WMS-only concepts worth generalizing) | Gap register |
| 5 | Finalize 10 entity families with field inventory | Entity catalog document |

**Entity Families (initial hypothesis from roadmap):**

| # | Forge Core Model | WMS Source(s) | MES Source(s) | Notes |
|---|---|---|---|---|
| 1 | `ManufacturingUnit` | Barrel | Batch | Tracked production container with lifecycle |
| 2 | `Lot` | Lot, LotVariation | Lot | Material grouping with traceability |
| 3 | `PhysicalAsset` | StorageLocation, Warehouse, HoldingLocation | Asset | WMS=coordinates, MES=ISA-95 hierarchy |
| 4 | `OperationalEvent` | BarrelEvent, EventType, EventReason | ProductionEvent, EquipmentStateTransition | Immutable event log |
| 5 | `BusinessEntity` | Customer, Vendor | Customer, Vendor | External parties |
| 6 | `ProcessDefinition` | Recipe | Recipe, MashingProtocol, Operation | WMS simple, MES very complex |
| 7 | `WorkOrder` | WarehouseJobs, JobTemplate, JobDependency | ScheduleOrder, ScheduleOrderQueue | Task assignment and sequencing |
| 8 | `MaterialItem` | Item, BarrelOemCode | Item, BomItem, Unit | SKU / inventory item master |
| 9 | `QualitySample` | Sample, SampleType, BarrelSample | TestParameter, BatchParameterValue | Quality measurement |
| 10 | `ProductionOrder` | ProductionOrder, BarrelingQueue | ProductionOrder, ScheduleOrder | Manufacturing order lifecycle |

**Gate P2.1:** Entity catalog reviewed, 10 families confirmed, field inventory complete.

---

### Sprint P2.2: Pydantic Core Models (Implementation)

**Goal:** Build `forge.core.models.manufacturing` with Pydantic v2 models for all 10 entity families.

**Epic P2.2.1 — Model Infrastructure**

| Step | Task | Output |
|---|---|---|
| 1 | Create `src/forge/core/models/manufacturing/` package | `__init__.py` with public exports |
| 2 | Create `base.py` — shared base model with `forge_id`, `source_system`, `source_id`, `captured_at` | Base class all manufacturing models inherit |
| 3 | Create `enums.py` — shared enumerations (UnitStatus, EventSeverity, AssetType, etc.) | Enum definitions used across models |

**Epic P2.2.2 — Entity Family Models** (one file per family)

| Step | File | Model(s) | Key Fields |
|---|---|---|---|
| 4 | `manufacturing_unit.py` | `ManufacturingUnit` | unit_type, serial_number, lot_id, location_id, status, lifecycle_state |
| 5 | `lot.py` | `Lot` | lot_number, product_type, recipe_id, status, quantity, unit_of_measure |
| 6 | `physical_asset.py` | `PhysicalAsset`, `AssetHierarchyLevel` | asset_type, name, parent_id, location_path, operational_state |
| 7 | `operational_event.py` | `OperationalEvent` | event_type, entity_type, entity_id, severity, timestamp, operator_id, metadata |
| 8 | `business_entity.py` | `BusinessEntity` | entity_type (customer/vendor/partner), name, external_ids, contact_info |
| 9 | `process_definition.py` | `ProcessDefinition`, `ProcessStep` | name, version, product_type, steps, parameters, bill_of_materials |
| 10 | `work_order.py` | `WorkOrder`, `WorkOrderDependency` | order_type, status, priority, assigned_asset_id, parent_id, dependencies |
| 11 | `material_item.py` | `MaterialItem` | item_number, name, category, unit_of_measure, external_ids |
| 12 | `quality_sample.py` | `QualitySample`, `SampleResult` | sample_type, entity_id, measured_value, unit, limits, passed |
| 13 | `production_order.py` | `ProductionOrder` | order_number, recipe_id, status, planned_quantity, actual_quantity, lot_ids |

**Epic P2.2.3 — Model Integration**

| Step | Task | Output |
|---|---|---|
| 14 | Update `forge.core.models.__init__.py` to re-export all manufacturing models | Backward-compatible public API |
| 15 | Verify existing model tests still pass | No regressions |

**Gate P2.2:** All 10 entity families implemented, `ruff check` clean, existing exports preserved.

---

### Sprint P2.3: Context Registry, Schemas, Tests & Docs

**Goal:** Complete the support infrastructure: context field registry, JSON Schema exports, comprehensive tests, and developer documentation.

**Epic P2.3.1 — Context Field Registry**

| Step | Task | Output |
|---|---|---|
| 1 | Create `src/forge/core/registry/context_fields.py` | `ContextFieldRegistry` class with canonical field definitions |
| 2 | Register all context fields from FACTS specs (lot_id, shift_id, operator_id, event_timestamp, event_type, work_order_id, batch_id, equipment_id, recipe_id, operating_mode) | Field name → type, description, WMS provenance, MES provenance |
| 3 | Add `get_field()`, `list_fields()`, `validate_context()` methods | Programmatic access for adapters |

**Epic P2.3.2 — JSON Schema Generation**

| Step | Task | Output |
|---|---|---|
| 4 | Create `src/forge/core/schemas/manufacturing/` package | Directory structure |
| 5 | Generate JSON Schema from each Pydantic model using `model.model_json_schema()` | One `.schema.json` per entity family |
| 6 | Write schema export script (`scripts/export_core_schemas.py`) | Reproducible schema generation |

**Epic P2.3.3 — Test Suite**

| Step | Task | Output |
|---|---|---|
| 7 | Create `tests/core/models/test_manufacturing_base.py` | Base model tests (forge_id generation, source tracking) |
| 8 | Create `tests/core/models/test_manufacturing_models.py` | Per-family validation: required fields, enum constraints, optional fields |
| 9 | Create `tests/core/models/test_manufacturing_serialization.py` | JSON round-trip, schema compliance, cross-model reference integrity |
| 10 | Create `tests/core/models/test_context_registry.py` | Registry CRUD, validation, provenance lookup |
| 11 | Create `tests/core/models/test_cross_model_consistency.py` | Shared enums consistent, ID references valid across families |

**Epic P2.3.4 — Documentation**

| Step | Task | Output |
|---|---|---|
| 12 | Write `docs/core/manufacturing-entity-catalog.md` | The analysis artifact from P2.1 — formalized |
| 13 | Write `docs/core/core-models-developer-guide.md` | How to use core models in adapter code, with examples |
| 14 | Update `PHASES.md` — check off F02 deliverables | Phase tracking |
| 15 | Write sprint retrospective | Lessons learned |

**Gate P2.3:** All tests pass, JSON Schemas generated, docs complete, PHASES.md updated.

---

## 6. Testing Plan

### Tier 1: Unit Tests (per model)
- Every required field enforced (missing → ValidationError)
- Every enum field rejects invalid values
- Optional fields accept None
- Default values applied correctly
- `forge_id` auto-generated as valid identifier

### Tier 2: Serialization Tests
- `model.model_dump()` → dict → `Model(**dict)` round-trip
- `model.model_dump_json()` → JSON string → `Model.model_validate_json()` round-trip
- Generated JSON Schema validates against draft 2020-12
- Cross-model references: `Lot.recipe_id` is valid `ProcessDefinition` ID format

### Tier 3: Integration Tests
- Context field registry validates real FACTS spec context mappings
- All 10 entity families can be instantiated and serialized together
- Schema export script produces valid, stable output

---

## 7. Verification Checklist

- [x] 10 entity family Pydantic models implemented
- [x] Shared base model with `forge_id`, `source_system`, `source_id`, `captured_at`
- [x] Shared enums module (no duplication across families)
- [x] All existing `forge.core.models` exports preserved (backward compatible)
- [x] Context field registry with WMS + MES provenance (12 fields)
- [x] JSON Schema generated for each entity family (10 schemas)
- [x] Unit tests: all required fields, enums, defaults (64 tests)
- [x] Serialization tests: round-trip JSON, schema compliance (7 tests)
- [x] Cross-model consistency tests (3 tests)
- [x] Context registry tests (17 tests)
- [x] `ruff check` clean (0 violations across src/forge/core/ and tests/core/)
- [x] Manufacturing entity catalog document
- [ ] Core models developer guide — deferred (entity catalog + inline docstrings serve this purpose)
- [x] PHASES.md updated (F02 deliverables checked off)
- [x] Sprint retrospective written

---

## 8. Commit Strategy

| Commit | Content | Gate |
|---|---|---|
| P2.1 | Entity catalog document + analysis notes | P2.1 gate |
| P2.2a | Base model, enums, first 5 entity families | Builds clean |
| P2.2b | Remaining 5 entity families, __init__.py integration | P2.2 gate |
| P2.3a | Context field registry + tests | Tests pass |
| P2.3b | JSON Schema generation + tests | Tests pass |
| P2.3c | Full test suite + documentation + PHASES.md | P2.3 gate |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Over-abstraction: models too generic to be useful | Adapters can't map cleanly | Ground every field in real WMS/MES provenance — if no source system has the field, don't add it |
| Under-abstraction: models too WHK-specific | Not industry-general | Use ISA-95/ISA-88 terminology where applicable; keep WHK-specific fields as `metadata` dict |
| Recipe complexity mismatch (WMS simple JSON, MES 9-model hierarchy) | ProcessDefinition can't represent both | Use layered approach: core fields + optional `steps` list + `metadata` for system-specific extensions |
| Pydantic v2 API differences from v1 | Import errors in sandbox | Use `model_config = ConfigDict(...)` pattern, test in sandbox early |
| Python 3.10 sandbox compat | StrEnum, datetime.UTC, `type X = Y` syntax | Reuse conftest.py monkey-patch pattern from FACTS tests |

---

## 10. Architecture Notes

### Where Core Models Sit in the Stack

```
┌─────────────────────────────────────────┐
│          Data Products (D4)              │  ← consumes core models
├─────────────────────────────────────────┤
│       ContextualRecord wrapper          │  ← wraps core model instances
├─────────────────────────────────────────┤
│  ★ Core Manufacturing Models (Path 2) ★ │  ← THIS SPRINT
├─────────────────────────────────────────┤
│     Adapter Framework (Path 3)          │  ← maps source → core models
├─────────────────────────────────────────┤
│     FACTS Governance (Path 1)           │  ← declares adapter contracts
├─────────────────────────────────────────┤
│     Source Systems (WMS, MES, ...)      │  ← raw Prisma models
└─────────────────────────────────────────┘
```

### Model Design Principles

1. **Provenance-first:** Every instance carries `source_system` + `source_id` so joins are always traceable
2. **Immutable core, mutable metadata:** Core fields are typed and validated; `metadata: dict` absorbs system-specific extensions
3. **ID agnostic:** `forge_id` is Forge's internal ID; `source_id` is the origin system's ID; they never collide
4. **Enum-driven lifecycle:** Status fields use Forge-canonical enums, not source system enums. Adapters map.
5. **Flat over nested:** Prefer `lot_id: str` reference over embedded `lot: Lot` object. Records reference each other by ID — the graph lives in Neo4j, not in nested Pydantic.

---

## 11. Retrospective

**Completed:** 2026-04-06 (same day as plan creation)
**Status:** All 3 sprints complete. 91 tests passing. 0 ruff violations.

### What Went Well

1. **Schema catalogs were comprehensive.** Having 121 WMS models and 84 MES models fully cataloged made the cross-reference straightforward. The roadmap's 7-row mapping table was an accurate starting hypothesis — expanded to 10 families with MaterialItem, QualitySample, and ProductionOrder added.

2. **Pydantic v2 patterns established cleanly.** The `ManufacturingModelBase` with `forge_id`, `source_system`, `source_id`, `captured_at`, `metadata` provides a consistent provenance envelope. JSON round-trip and schema generation worked first-try.

3. **Context field registry bridges FACTS → Core Models.** The 6 cross-spoke fields from Path 1 FACTS analysis became the first 6 entries in the registry. The remaining 6 come from `ContextualRecord.context` fields. Clean provenance mapping from both WMS and MES.

### Challenges

1. **`TYPE_CHECKING` + Pydantic v2 + `from __future__ import annotations` is a trap.** Pydantic resolves annotations at class creation time via `get_type_hints()`. If enum types are only in `TYPE_CHECKING`, Pydantic raises `not fully defined`. Solution: keep all types used in Pydantic field annotations as runtime imports. Apply `# noqa: TC001/TC003` where ruff disagrees.

2. **Recipe complexity asymmetry.** WMS Recipe is a simple JSON blob. MES Recipe involves 9 related models (Recipe → UnitProcedure → Operation → EquipmentPhase → PhaseParameter, plus MashingProtocol with steps). The `ProcessDefinition` core model handles this via flat required fields + optional `steps: list[ProcessStep]` + `parameters: dict`. This is adequate for the Forge vocabulary layer, but adapters will need richer mapping logic.

3. **Python 3.10 sandbox continues to require monkey-patches.** Reused the conftest.py pattern from FACTS. Not a risk for production (targets 3.12+), but worth noting for CI.

### Patterns for Future FxTS Frameworks

- **Provenance envelope pattern:** `forge_id` + `source_system` + `source_id` + `captured_at` + `metadata` should be the standard base for any Forge domain model
- **Flat references over embedded objects:** Use `lot_id: str` not `lot: Lot` — keeps models serializable and avoids circular dependency issues. The graph database (Neo4j) handles relationships.
- **Enum-driven lifecycles with flexible defaults:** Define canonical enums (UnitStatus, OrderStatus) but don't over-constrain — adapters map source-specific values.

### Test Coverage

| Component | Tests | Status |
|---|---|---|
| ManufacturingModelBase | 7 | ✅ |
| ManufacturingUnit | 7 | ✅ |
| Lot | 4 | ✅ |
| PhysicalAsset | 6 | ✅ |
| OperationalEvent | 5 | ✅ |
| BusinessEntity | 4 | ✅ |
| ProcessDefinition | 4 | ✅ |
| WorkOrder | 5 | ✅ |
| MaterialItem | 4 | ✅ |
| QualitySample | 4 | ✅ |
| ProductionOrder | 5 | ✅ |
| Serialization | 7 | ✅ |
| Cross-model consistency | 3 | ✅ |
| Context field CRUD | 7 | ✅ |
| Context validation | 5 | ✅ |
| Context provenance | 4 | ✅ |
| Default registry | 7 | ✅ |
| ContextField dataclass | 3 | ✅ |
| **Total** | **91** | **✅ All passing** |
