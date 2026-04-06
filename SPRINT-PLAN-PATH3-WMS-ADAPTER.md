# Sprint Development Plan: Path 3 — Working WMS Adapter (Vertical Slice)

**Plan Version:** 1.0
**Created:** 2026-04-06
**Owner:** reh3376
**Path:** Roadmap Path 3 — WMS Adapter (Vertical Slice)
**Branch:** `forge_dev01`
**Status:** READY FOR EXECUTION

---

## 1. Problem Statement

Forge has a FACTS spec that declares what the WMS adapter must do (Path 1), and core models that define the shared manufacturing vocabulary (Path 2). But neither proves that the architecture works end-to-end. Path 3 builds the first real adapter — `whk-wms` — that connects to the WMS system, maps its entities to Forge core models, and emits `ContextualRecord` instances.

This is a vertical slice: one adapter, fully conformant, demonstrating the entire flow from source system → adapter → governance pipeline. It becomes the template for the MES adapter and every future integration.

**Core question this plan answers:** Can Forge actually ingest and contextualize real manufacturing data?

---

## 2. Scope & Constraints

### In Scope
- `forge/adapters/whk_wms/` package — the WMS adapter implementation
- Entity mappers: WMS Prisma models → Forge ManufacturingUnit, Lot, PhysicalAsset, etc.
- Context mapper: WMS-specific fields → Forge ContextualRecord context fields
- Manifest: `manifest.json` declaring capabilities per FACTS spec
- FACTS conformance: adapter passes `facts_runner.py` static checks
- Unit tests for all mappers and context transformation logic
- Integration test scaffold for WMS E2E Docker stack

### Out of Scope (deferred)
- Live GraphQL connection to WMS (requires WMS E2E Docker stack running)
- Live RabbitMQ subscription (requires WMS Docker stack)
- Live integration tests against actual WMS data
- CI/CD pipeline for adapter deployment
- MES adapter (same pattern, future sprint)
- TypeScript Zod equivalents

### Constraints
- **Read-only:** WMS adapter must not impact WMS availability or data
- **FACTS conformant:** All 6 mandatory context fields mapped. All 10 FACTS spec sections satisfied.
- **Python 3.12+, UV, Ruff:** All code follows project standards
- **No WMS modifications:** Adapter connects to existing APIs as documented

---

## 3. Dependencies

| Dependency | Status | Notes |
|---|---|---|
| AdapterBase interface | ✅ Complete | `src/forge/adapters/base/interface.py` — 4 mixins |
| FACTS whk-wms spec | ✅ Complete | `src/forge/governance/facts/specs/whk-wms.facts.json` — 14 data sources, 6 mandatory context fields |
| Core manufacturing models | ✅ Complete | Path 2 — 10 entity families, 12 context fields |
| ContextualRecord model | ✅ Complete | `src/forge/core/models/contextual_record.py` |
| AdapterManifest model | ✅ Complete | `src/forge/core/models/adapter.py` |
| WMS Prisma schema analysis | ✅ Complete | 121 models cataloged |

---

## 4. Documents Accessed

| Document | Path | Purpose |
|---|---|---|
| Adapter Integration Roadmap | `ROADMAP-ADAPTER-INTEGRATION.md` lines 79-115 | Path 3 definition |
| Adapter base interface | `src/forge/adapters/base/interface.py` | Abstract classes to implement |
| FACTS WMS spec | `src/forge/governance/facts/specs/whk-wms.facts.json` | Contract: capabilities, connection params, data sources, context mappings |
| Core manufacturing models | `src/forge/core/models/manufacturing/*.py` | Target types for entity mapping |
| ContextualRecord model | `src/forge/core/models/contextual_record.py` | Output format |
| WMS CLAUDE.md | `whk-wms/CLAUDE.md` | WMS architecture, GraphQL/REST/RabbitMQ patterns |

---

## 5. Implementation Plan

### Sprint P3.1: Adapter Skeleton & Manifest

**Goal:** Create the WMS adapter package, implement AdapterBase lifecycle, and declare the manifest.

**Epic P3.1.1 — Package Structure**

| Step | Task | Output |
|---|---|---|
| 1 | Create `src/forge/adapters/whk_wms/` package | `__init__.py` |
| 2 | Create `manifest.json` from FACTS spec | Adapter self-description |
| 3 | Create `adapter.py` with `WhkWmsAdapter` class | Implements AdapterBase + 3 capability mixins |
| 4 | Create `config.py` with connection params dataclass | Typed config from manifest's connection_params |

**Epic P3.1.2 — Lifecycle Implementation**

| Step | Task | Output |
|---|---|---|
| 5 | Implement `configure()` — validate and store connection params | Config validation |
| 6 | Implement `start()` — set state to CONNECTING → HEALTHY | State machine |
| 7 | Implement `stop()` — graceful shutdown | Cleanup |
| 8 | Implement `health()` — return AdapterHealth from internal state | Health reporting |
| 9 | Implement `collect()` stub — async generator scaffold | Placeholder for Sprint P3.2 |
| 10 | Implement mixin stubs — subscribe/backfill/discover placeholders | Interface compliance |

**Gate P3.1:** Adapter instantiates, lifecycle methods callable, manifest loads, ruff clean.

---

### Sprint P3.2: Entity Mappers

**Goal:** Build mapper functions that transform WMS data shapes into Forge core models and ContextualRecords.

**Epic P3.2.1 — Entity Mapper Module**

| Step | File | Mapper | WMS → Forge |
|---|---|---|---|
| 1 | `mappers/__init__.py` | Package | Exports |
| 2 | `mappers/manufacturing_unit.py` | `map_barrel()` | Barrel dict → ManufacturingUnit |
| 3 | `mappers/lot.py` | `map_lot()` | Lot dict → Lot |
| 4 | `mappers/physical_asset.py` | `map_storage_location()`, `map_warehouse()` | StorageLocation/Warehouse → PhysicalAsset |
| 5 | `mappers/operational_event.py` | `map_barrel_event()` | BarrelEvent dict → OperationalEvent |
| 6 | `mappers/business_entity.py` | `map_customer()`, `map_vendor()` | Customer/Vendor → BusinessEntity |
| 7 | `mappers/work_order.py` | `map_warehouse_job()` | WarehouseJobs dict → WorkOrder |
| 8 | `mappers/production_order.py` | `map_production_order()` | ProductionOrder dict → ProductionOrder |

**Epic P3.2.2 — Context Mapper**

| Step | Task | Output |
|---|---|---|
| 9 | Create `context.py` with `build_record_context()` | Maps entity data → RecordContext (6 mandatory + 5 optional fields) |
| 10 | Implement shift enrichment rule | timestamp → shift_id (day/night based on Louisville timezone) |
| 11 | Implement location enrichment rule | Compose physical_asset_id from warehouse/floor/rick/position |
| 12 | Implement event type normalization | RabbitMQ exchange names → normalized `barrel.*` event types |

**Epic P3.2.3 — Record Builder**

| Step | Task | Output |
|---|---|---|
| 13 | Create `record_builder.py` | `build_contextual_record()` — assembles ContextualRecord from mapped entity + context |
| 14 | Wire `collect()` to use mappers + record builder | Complete data flow skeleton |

**Gate P3.2:** All mappers produce valid Forge core model instances. Context mapper handles all 6 mandatory + 5 optional fields. Record builder emits valid ContextualRecords.

---

### Sprint P3.3: Tests, FACTS Conformance & Documentation

**Goal:** Comprehensive test coverage, FACTS runner verification, and developer documentation.

**Epic P3.3.1 — Unit Tests**

| Step | Test File | Coverage |
|---|---|---|
| 1 | `test_whk_wms_adapter.py` | Lifecycle (configure/start/stop/health), manifest loading |
| 2 | `test_mappers.py` | All 8 entity mappers: valid input → correct output, missing fields → graceful handling |
| 3 | `test_context.py` | Context building, shift enrichment, location composition, event normalization |
| 4 | `test_record_builder.py` | Full ContextualRecord assembly, validation hook, required fields |

**Epic P3.3.2 — FACTS Conformance**

| Step | Task | Output |
|---|---|---|
| 5 | Verify adapter manifest matches FACTS spec | All 10 sections consistent |
| 6 | Run FACTS runner static checks against whk-wms spec | All PASS |
| 7 | Verify 6 mandatory context fields in validate_record | Conformance test |

**Epic P3.3.3 — Documentation**

| Step | Task | Output |
|---|---|---|
| 8 | Update PHASES.md — check off F30/F32 deliverables | Phase tracking |
| 9 | Write sprint retrospective | Lessons learned |
| 10 | Update ROADMAP status | Path 3 progress |

**Gate P3.3:** All tests pass, FACTS static conformance verified, docs updated.

---

## 6. Testing Plan

### Tier 1: Unit Tests (per mapper)
- Valid WMS dict → correct Forge model fields
- Missing optional fields → None/defaults
- Missing required fields → raises or returns None with error
- Enum mapping: WMS status strings → Forge canonical enums

### Tier 2: Context & Record Tests
- All 6 mandatory context fields populated from barrel event data
- Shift enrichment: daytime timestamp → "day", nighttime → "night"
- Location composition: {warehouse}-{building}-F{floor}-R{rick}-P{position}
- Event type normalization: exchange name → "barrel.{action}" format
- ContextualRecord validates against DataContract

### Tier 3: Integration (scaffold only — requires WMS Docker stack)
- Adapter lifecycle: configure → start → collect → stop
- Record emission: collect yields valid ContextualRecords
- FACTS runner: `facts_runner.run()` against live adapter (SKIP for now)

---

## 7. Verification Checklist

- [x] WhkWmsAdapter class implements AdapterBase + 3 capability mixins
- [x] manifest.json matches FACTS spec identity/capabilities/connection
- [x] 9 entity mappers (barrel, lot, storage_location, warehouse, event, customer, vendor, job, production_order)
- [x] Context mapper handles 6 mandatory + 5 optional context fields
- [x] Shift enrichment rule (Louisville timezone)
- [x] Location composition enrichment
- [x] Event type normalization
- [x] Record builder emits valid ContextualRecords
- [x] Unit tests for all mappers (52 tests)
- [x] Context/enrichment tests (26 tests)
- [x] Record builder tests (27 tests)
- [x] Adapter lifecycle tests (22 tests)
- [x] FACTS static conformance verified (48 tests still passing)
- [x] `ruff check` clean
- [x] PHASES.md updated
- [x] Sprint retrospective

---

## 8. Commit Strategy

| Commit | Content | Gate |
|---|---|---|
| P3.1 | Adapter skeleton, manifest, lifecycle, config | P3.1 gate |
| P3.2a | Entity mappers (7 mapper functions) | Mappers test |
| P3.2b | Context mapper, enrichment rules, record builder | P3.2 gate |
| P3.3 | Tests, FACTS conformance, docs, retrospective | P3.3 gate |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No WMS Docker stack in sandbox | Can't run live integration tests | Build with typed stubs + mock data; scaffold integration tests for future execution |
| GraphQL schema drift | Mapper field names wrong | Ground mappers in Prisma schema analysis (which we have), not live introspection |
| RabbitMQ exchange names undocumented | Subscribe targets wrong | FACTS spec documents all 22+14 exchanges; use spec as source of truth |
| Context field mapping complexity | Edge cases in enrichment | Test enrichment rules with boundary cases (midnight shift change, timezone DST) |

---

## 10. Architecture Notes

### Adapter Internal Structure

```
forge/adapters/whk_wms/
├── __init__.py          # Package exports
├── adapter.py           # WhkWmsAdapter — lifecycle + collect()
├── config.py            # WhkWmsConfig — typed connection params
├── manifest.json        # Self-description (mirrors FACTS spec identity)
├── context.py           # build_record_context() + enrichment rules
├── record_builder.py    # build_contextual_record() — assembles final output
└── mappers/
    ├── __init__.py      # Exports all mapper functions
    ├── manufacturing_unit.py  # map_barrel()
    ├── lot.py                 # map_lot()
    ├── physical_asset.py      # map_storage_location(), map_warehouse()
    ├── operational_event.py   # map_barrel_event()
    ├── business_entity.py     # map_customer(), map_vendor()
    ├── work_order.py          # map_warehouse_job()
    └── production_order.py    # map_production_order()
```

### Data Flow

```
WMS (GraphQL/RabbitMQ)
  │
  ▼
Raw dict (WMS-native shape)
  │
  ▼ mappers/*.py
  │
Forge Core Model instance (ManufacturingUnit, Lot, etc.)
  │
  ▼ context.py
  │
RecordContext (6 mandatory + optional context fields)
  │
  ▼ record_builder.py
  │
ContextualRecord (record_id, source, timestamp, value, context, lineage)
  │
  ▼
Governance Pipeline (FACTS validation → storage → curation)
```

---

## 11. Retrospective

**Completed:** 2026-04-06
**Status:** P3.1, P3.2, P3.3 — all gates passed

### What went well

1. **FACTS spec as the contract** — the context_mapping section of whk-wms.facts.json defined exactly what the adapter needed to implement: 11 field mappings and 3 enrichment rules. No ambiguity, no scope creep.

2. **Mapper pattern** — pure functions (raw dict → model | None) with dual camelCase/snake_case key support proved clean and highly testable. Every mapper follows the same shape, making the MES adapter implementation straightforward.

3. **Path 2 models absorbed cleanly** — the 10 manufacturing entity families and their enums mapped 1:1 to WMS entities. The provenance envelope (`source_system` + `source_id` + `captured_at`) was exactly right for cross-system identity.

4. **RecordContext.extra** — the `extra: dict[str, Any]` field was the correct design for FACTS-specific context fields that don't map to named RecordContext fields. Both vocabularies (generic Forge + WMS-specific FACTS) are preserved in one record.

### What we learned

1. **TYPE_CHECKING + Pydantic v2 + `from __future__ import annotations`** — this combination breaks Pydantic's annotation resolution. Types used in field annotations must be runtime imports. This was a Path 2 lesson that hit again in adapter.py when AdapterHealth used `datetime` from a TYPE_CHECKING block.

2. **Python 3.10 sandbox vs 3.12+ target** — `datetime.UTC`, `StrEnum`, and `Z`-suffix ISO parsing all need accommodation. The conftest monkey-patch pattern works but source code must use `timezone.utc` with `# noqa: UP017` suppression.

3. **Z-suffix timestamp parsing** — Python 3.10's `datetime.fromisoformat()` doesn't handle `Z` suffix. The `.replace("Z", "+00:00")` pattern is needed universally.

### Test coverage

| Test file | Tests | Coverage |
|---|---|---|
| test_whk_wms_adapter.py | 22 | Manifest, lifecycle, collect, subscribe, discover |
| test_mappers.py | 52 | All 9 mapper functions + edge cases |
| test_context.py | 26 | Shift, location, event normalization, full context |
| test_record_builder.py | 27 | Quality, timestamps, tag paths, full record assembly |
| **Total new** | **127** | |
| **Total project** | **462** | (335 existing + 127 new) |

### Deferred to P3-live

- Live GraphQL client session (requires WMS E2E Docker stack)
- Live RabbitMQ subscription binding
- Integration tests against actual WMS data
- FQTS data quality specs
