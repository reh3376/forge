# Sprint Plan — Path 4: WHK MES Adapter (Vertical Slice)

**Version:** 1.0
**Created:** 2026-04-06
**Owner:** reh3376
**Phase Alignment:** F33 (WHK MES Adapter)
**Dependencies:** Path 1 (FACTS), Path 2 (Core Models), Path 3 (WMS Adapter — pattern template)
**Status:** Complete

---

## 1. Problem Statement

Build the second Forge spoke adapter — `whk-mes` — following the pattern established by the WMS adapter (Path 3). The MES adapter is more complex than WMS in three ways: it adds MQTT as a third protocol, it supports write-back mutations, and it models ISA-88 procedural hierarchy (Procedure → Unit Procedure → Operation → Equipment Phase → Phase Parameter). The MES FACTS spec (`whk-mes.facts.json`) defines 17 data sources, 15 context field mappings, and 3 enrichment rules.

---

## 2. Scope & Constraints

**In scope:**
- MES adapter skeleton (`WhkMesAdapter` class with 5 capability mixins)
- MES-specific config with 18 connection params (GraphQL + RabbitMQ + MQTT + Azure)
- 15 context field mappings + 3 enrichment rules (shift, event type, equipment from MQTT topic)
- 8 entity mappers: production_order, batch, recipe, schedule_order, equipment, operational_event, business_entity, lot
- Record builder (reuse WMS pattern, MES-specific quality assessment)
- Unit tests (targeting 120+ tests)
- FACTS static conformance

**Out of scope (deferred to live):**
- Live GraphQL/RabbitMQ/MQTT connections
- Write-back mutations (requires F34 gRPC transport)
- Integration tests against MES Docker stack
- FQTS data quality specs

---

## 3. Key Differences from WMS Adapter

| Aspect | WMS (Path 3) | MES (Path 4) |
|--------|-------------|-------------|
| Protocols | GraphQL + AMQP | GraphQL + AMQP + MQTT |
| Capabilities | read, subscribe, backfill, discover | read, **write**, subscribe, backfill, discover |
| Connection params | 9 | 18 (adds MQTT broker, certs, buffer config) |
| Context fields | 6 mandatory + 5 optional | 6 mandatory + 10 optional |
| Enrichment rules | shift, location, event_type | shift, event_type, **equipment from MQTT topic** |
| Auth methods | azure_entra_id, bearer, api_key | azure_entra_id, bearer, **certificate** |
| Entity model | Flat (barrel-centric) | ISA-88 hierarchy (class/instance pattern) |
| Primary entity | Barrel (ManufacturingUnit) | Batch (ManufacturingUnit) |

---

## 4. Entity Mapping Plan

| MES Entity | Forge Core Model | Mapper Function | Notes |
|-----------|-----------------|-----------------|-------|
| Batch | ManufacturingUnit | `map_batch` | unit_type="batch", ISA-88 state mapping |
| Lot | Lot | `map_lot` | Shared with WMS via lot_id cross-spoke field |
| Asset | PhysicalAsset | `map_asset` | ISA-88 hierarchy via parentId + assetPath |
| StepExecution + ProductionEvent | OperationalEvent | `map_step_event`, `map_production_event` | ISA-88 phase/step context |
| Customer + Vendor | BusinessEntity | `map_customer`, `map_vendor` | Similar to WMS but simpler data shape |
| Recipe + MashingProtocol | ProcessDefinition | `map_recipe` | Class/instance distinction |
| ProductionOrder + ScheduleOrder | ProductionOrder + WorkOrder | `map_production_order`, `map_schedule_order` | Schedule order → WorkOrder mapping |
| Item | MaterialItem | `map_item` | MES item master data |

---

## 5. Implementation Plan

### Sprint P4.1: Adapter Skeleton
- Create `src/forge/adapters/whk_mes/` package
- `config.py` — `WhkMesConfig` with 18 connection params
- `manifest.json` — adapter self-description from FACTS spec
- `adapter.py` — `WhkMesAdapter(AdapterBase, WritableAdapter, SubscriptionProvider, BackfillProvider, DiscoveryProvider)`
- `context.py` — `build_record_context()` with 15 mappings + 3 enrichment rules
- `record_builder.py` — reuse WMS pattern, MES-specific quality assessment

### Sprint P4.2: Entity Mappers
- `mappers/batch.py` — `map_batch()`
- `mappers/lot.py` — `map_lot()`
- `mappers/physical_asset.py` — `map_asset()`
- `mappers/operational_event.py` — `map_step_event()`, `map_production_event()`
- `mappers/business_entity.py` — `map_customer()`, `map_vendor()`
- `mappers/process_definition.py` — `map_recipe()`
- `mappers/production_order.py` — `map_production_order()`, `map_schedule_order()`
- `mappers/material_item.py` — `map_item()`
- `mappers/__init__.py` — re-export all mappers

### Sprint P4.3: Tests & Verification
- `tests/adapters/whk_mes/conftest.py` — Python 3.10 compat patches
- `tests/adapters/whk_mes/test_whk_mes_adapter.py` — manifest, lifecycle, collect, subscribe, discover, write stub
- `tests/adapters/whk_mes/test_context.py` — shift, event type normalization, MQTT topic parsing
- `tests/adapters/whk_mes/test_record_builder.py` — quality assessment, timestamps, tag paths
- `tests/adapters/whk_mes/test_mappers.py` — all 10 mapper functions + edge cases
- ruff check clean
- Full test suite (target: 580+ total)
- PHASES.md F33 update
- Sprint retrospective

---

## 6. Verification Checklist

- [x] WhkMesAdapter class implements AdapterBase + 4 capability mixins (including WritableAdapter)
- [x] manifest.json matches MES FACTS spec identity/capabilities/connection
- [x] 11 mapper functions covering 8 entity families (exceeded target of 10)
- [x] Context mapper handles 6 mandatory + 10 optional context fields
- [x] Shift enrichment rule (Louisville timezone, shared with WMS)
- [x] Event type normalization (MES domain events → Forge canonical)
- [x] Equipment ID from MQTT topic enrichment
- [x] Record builder emits valid ContextualRecords
- [x] WritableAdapter.write() stub present
- [x] Unit tests for all mappers (85 tests)
- [x] Context/enrichment tests (45 tests)
- [x] Record builder tests (30 tests)
- [x] Adapter lifecycle tests (28 tests)
- [x] `ruff check` clean
- [x] PHASES.md updated
- [x] Sprint retrospective

---

## 7. Retrospective

### Results

| Metric | Target | Actual |
|--------|--------|--------|
| MES adapter tests | 120+ | **188** |
| Total project tests | 580+ | **650** |
| Mapper functions | 10 | **11** (map_step_event + map_production_event split) |
| Ruff violations | 0 | **0** (20 found and fixed during development) |
| Context fields | 16 | **16** (6 mandatory + 10 optional) |
| Enrichment rules | 3 | **3** (shift, event_type, MQTT equipment) |

### What Went Well

1. **WMS pattern proved reusable.** The adapter skeleton, record builder, and conftest fixtures transferred directly from Path 3. Estimated 40% of MES boilerplate was copy-adapt from WMS, validating the spoke pattern.
2. **FACTS spec drove implementation.** Every connection param, context field, enrichment rule, and data source in `whk-mes.facts.json` had a 1:1 implementation target. No ambiguity about "done."
3. **ISA-88 class/instance pattern landed cleanly.** The `is_class_definition` / `is_master` metadata approach lets downstream consumers differentiate templates from runtime instances without polluting the core model.
4. **Event type normalization is comprehensive.** 30+ MES domain events map through explicit lookup, compound key parsing, MQTT topic extraction, and RabbitMQ exchange fallback — four tiers of resolution with a clean "unknown" default.

### Lessons Learned

1. **Boolean fields and Python's `or` operator.** `False or fallback` evaluates the fallback. This bit us on `isClassDefinition: False` disappearing from metadata. Fix: explicit `is None` checks for any field where `False` is a meaningful value. This is a pattern to watch in all future mappers.
2. **Nested dict access needs a helper.** MES GraphQL responses nest objects 2-3 levels deep (`equipmentPhase.equipment.id`). The initial ternary+or chains were error-prone. The `_nested()` helper inside `build_record_context()` is cleaner and should be promoted to a shared utility if a third adapter needs it.
3. **MQTT topic parsing order matters.** Trying compound keys before direct event keys caused `production/StepExecution/step_completed` to miss the lookup. Fix: try the most specific part (event suffix) first, then compound. Priority order in normalize_event_type() is now: explicit field → MQTT event suffix → MQTT compound → RabbitMQ exchange → unknown.
4. **Ruff catches real issues early.** The 20 initial violations included line-length problems hiding complex expressions, unused imports from copy-paste, and `contextlib.suppress` suggestions that led to cleaner helper functions.

### Deferred to F34 (gRPC Transport) / Live

- `WritableAdapter.write()` returns `False` — actual MES mutations require gRPC sidecar
- Live GraphQL/RabbitMQ/MQTT connections (adapter uses `inject_records()` for testing)
- Integration tests against MES Docker stack
- FQTS data quality specs
- Cross-spoke lot reconciliation (WMS lot_id ↔ MES lot_id via shared Forge lot model)
