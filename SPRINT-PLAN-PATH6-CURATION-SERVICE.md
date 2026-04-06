# Sprint Plan — Path 6: Curation Service (F40)

**Version:** 1.0
**Created:** 2026-04-06
**Owner:** reh3376
**Phase Alignment:** F40 (Curation Service)
**Dependencies:** F32 (WMS Adapter), F33 (MES Adapter), F34 (Transport Layer)
**Status:** Complete

---

## 1. Problem Statement

Forge's adapters (WMS, MES) produce raw `ContextualRecord` streams — individual data points wrapped in operational context. These records are valuable but not yet **decision-ready**: values use source-system units (one adapter says °F, another says °C), timestamps are at raw resolution (sub-millisecond spikes alongside hourly readings), and cross-system records are disconnected (a WMS barrel entry and an MES batch start that describe the same event use different IDs).

F40 builds the **curation layer** — the transformation engine that takes raw ContextualRecords and produces governed, normalized, time-aligned **data products** with full lineage. This is the layer that makes the BBD Papers' vision operational: context-rich data products that support structured decision-making.

**Design constraint:** F20/F21/F22 (storage engines) are not yet built. The curation layer must use **in-memory storage abstractions** (same pattern as Path 5's `InMemoryChannel`) so it's fully testable now and wirable to real databases later.

---

## 2. Scope & Constraints

**In scope:**
- Normalization engine: unit conversion registry, time bucketing, value alignment
- Data product registry: define, version, publish, deprecate data products (in-memory store)
- Curation pipeline: composable transformation steps (normalize → aggregate → enrich → emit)
- Lineage tracker: records every transformation from raw ContextualRecord to curated output
- Quality monitor: SLO evaluation engine aligned with FQTS framework
- `forge-curation` FastAPI service with OpenAPI
- FQTS spec for curated data products (schema + runner integration)
- FACTS spec for curation endpoints
- Unit tests for all modules

**Out of scope (deferred):**
- Real database persistence (TimescaleDB continuous aggregates, PostgreSQL catalog)
- Kafka/event-driven pipeline triggering
- Production deployment (Docker Compose service)
- Continuous aggregation scheduling (cron/scheduler)
- Cross-engine join materialization
- FQTS runner implementation (spec only — runner comes with F13)

---

## 3. Architecture

```
                         ContextualRecord stream
                                │
                    ┌───────────▼───────────┐
                    │   Curation Pipeline     │
                    │                         │
                    │  ┌─────────────────┐    │
                    │  │ 1. Normalize     │    │   Unit conversion, value alignment
                    │  └────────┬────────┘    │
                    │  ┌────────▼────────┐    │
                    │  │ 2. Time-Bucket   │    │   Align to configurable windows
                    │  └────────┬────────┘    │
                    │  ┌────────▼────────┐    │
                    │  │ 3. Aggregate     │    │   Cross-record rollups (min/max/avg/count)
                    │  └────────┬────────┘    │
                    │  ┌────────▼────────┐    │
                    │  │ 4. Enrich        │    │   Cross-system joins, derived fields
                    │  └────────┬────────┘    │
                    │  ┌────────▼────────┐    │
                    │  │ 5. Validate      │    │   Quality SLO checks
                    │  └────────┬────────┘    │
                    └───────────┼───────────┘
                                │
            ┌───────────────────┼────────────────────┐
            ▼                   ▼                     ▼
    ┌──────────────┐   ┌──────────────┐    ┌──────────────────┐
    │ Data Product  │   │   Lineage    │    │  Quality Report  │
    │ Registry      │   │   Tracker    │    │  (SLO eval)      │
    └──────────────┘   └──────────────┘    └──────────────────┘
```

### Key Design Decisions

1. **Pipeline as composable steps:** Each transformation is a `CurationStep` with `process(records) → records` interface. Steps are independent, reorderable, and testable in isolation.
2. **In-memory stores for everything:** `InMemoryProductStore`, `InMemoryLineageStore`. Same ABC + concrete pattern as `TransportChannel` / `InMemoryChannel`. When F20-F22 land, we add `TimescaleProductStore`, `PostgresLineageStore` — pipeline code doesn't change.
3. **Lineage is first-class:** Every transformation step appends to the lineage chain. The curated record knows exactly which raw records it was derived from and what transformations were applied.
4. **Quality SLOs are declarative:** Defined as part of the DataProduct definition, evaluated by the quality monitor. Matches FQTS spec structure.
5. **Normalization registry is extensible:** Unit conversions, value mappings, and time-bucketing rules are registered, not hard-coded. WHK-specific conversions (°F→°C, barrel volume units) are examples, not the only conversions.

---

## 4. Implementation Plan

### Sprint P6.1: Normalization Engine
- `src/forge/curation/normalization.py`:
  - `UnitConversion` dataclass: `from_unit`, `to_unit`, `factor`, `offset`, `convert(value)`
  - `UnitRegistry`: register/lookup conversions, canonical unit per dimension
  - `ValueNormalizer`: apply unit conversion to RecordValue, normalize string enums
  - `TimeBucketer`: floor timestamps to configurable windows (1min, 5min, 15min, 1hr, 1day)
  - Built-in WHK conversions: °F↔°C, gallons↔liters, proof↔ABV
- Tests: 20+ normalization tests

### Sprint P6.2: Data Product Registry + Lineage Tracker
- Enhance `src/forge/core/models/data_product.py`:
  - Add `DataProductVersion`, `DataProductField`, `LineageRecord`, `TransformationStep`
  - Add `AggregationSpec` for defining rollup behavior
- `src/forge/curation/registry.py`:
  - `ProductStore` ABC: `save`, `get`, `list`, `publish`, `deprecate`
  - `InMemoryProductStore` concrete implementation
  - `DataProductRegistry`: CRUD + lifecycle + version management
- `src/forge/curation/lineage.py`:
  - `LineageStore` ABC: `record_step`, `get_lineage`, `get_downstream`
  - `InMemoryLineageStore` concrete implementation
  - `LineageTracker`: records transformation steps, builds lineage chains
- Tests: 25+ registry and lineage tests

### Sprint P6.3: Curation Pipeline + Quality Monitor
- `src/forge/curation/pipeline.py`:
  - `CurationStep` ABC: `name`, `process(records) → records`
  - `NormalizationStep`, `TimeBucketStep`, `AggregationStep`, `EnrichmentStep`, `ValidationStep`
  - `CurationPipeline`: ordered list of steps, execute(records) → CurationResult
  - `CurationResult`: output records + lineage entries + quality report
- `src/forge/curation/quality.py`:
  - `QualityRule` ABC: `evaluate(records) → QualityResult`
  - Built-in rules: `CompletenessRule`, `FreshnessRule`, `RangeRule`, `ConsistencyRule`
  - `QualityMonitor`: evaluate all SLOs for a data product, produce report
  - `QualityReport`: per-SLO pass/fail + aggregate score
- `src/forge/curation/aggregation.py`:
  - `AggregationFunction` enum: MIN, MAX, AVG, SUM, COUNT, LAST, FIRST
  - `aggregate_records()`: group by context keys + time bucket, apply agg functions
- Tests: 30+ pipeline and quality tests

### Sprint P6.4: FastAPI Service + Specs + WHK Data Products
- `src/forge/curation/service.py`:
  - FastAPI app (`forge-curation` service)
  - `POST /curate` — submit ContextualRecords for curation
  - `GET /products` — list registered data products
  - `GET /products/{id}` — get data product definition + latest quality report
  - `POST /products` — register a new data product
  - `PUT /products/{id}/publish` — publish a data product
  - `GET /products/{id}/lineage` — get lineage for a data product
  - `GET /products/{id}/quality` — get quality report
  - `GET /healthz` — health check
- `specs/curation.facts.json` — FACTS spec for curation endpoints
- `specs/whk-data-products.fqts.json` — FQTS spec for WHK data products
- 3 WHK data product definitions:
  1. **Production Context Dataset** — batch/lot + process params + quality
  2. **Inventory-Production Linkage** — WMS inventory ↔ MES production orders
  3. **Equipment Utilization** — equipment state + batch context + shift
- Integration tests with WMS + MES adapter records flowing through full pipeline
- ruff check clean
- Full test suite verification

---

## 5. Verification Checklist

- [x] Normalization engine converts °F→°C, gallons→liters, proof→ABV correctly
- [x] TimeBucketer aligns timestamps to 1min/5min/1hr/1day windows
- [x] Data product registry CRUD: create, read, list, publish, deprecate
- [x] Data product versioning tracks schema changes
- [x] Lineage tracker records full chain from raw ContextualRecord → curated output
- [x] Curation pipeline processes WMS adapter records end-to-end
- [x] Curation pipeline processes MES adapter records end-to-end
- [x] Quality monitor evaluates completeness, freshness, range SLOs
- [x] QualityReport shows per-SLO pass/fail with measurements
- [x] FastAPI service starts and serves all endpoints
- [x] 3 WHK data product definitions registered in FQTS spec
- [x] FACTS spec for curation endpoints written (`curation.facts.json`)
- [x] FQTS spec for WHK data products written (`whk-data-products.fqts.json`)
- [x] `ruff check` clean
- [x] All tests passing: 130 new curation tests, 853 total project tests
- [x] PHASES.md F40 updated
- [x] Sprint retrospective

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Aggregation without real time-series DB | Medium | In-memory aggregation with pandas-like groupby — proves logic, defers scale |
| Unit conversion edge cases (NaN, None, mixed types) | Medium | Explicit handling for each edge case, comprehensive test coverage |
| Quality SLO evaluation without continuous data | Low | SLOs evaluated on in-memory record batches — scheduling deferred |
| Cross-system join without graph DB | Medium | In-memory join by shared context fields (lot_id, batch_id, equipment_id) |
| Pipeline step ordering sensitivity | Low | Steps are explicit and ordered; tests verify different orderings |

---

## 8. Retrospective

### Results

| Metric | Target | Actual |
|--------|--------|--------|
| Curation tests | ~80 | **130** |
| Total project tests | ~800 | **853** |
| Curation modules | 6 | **6** (normalization, aggregation, registry, lineage, quality, pipeline) |
| FastAPI endpoints | 8 | **8** (healthz, curate, CRUD products, lineage, quality) |
| Unit conversions | 5 | **10** (5 dimensions × 2 directions = 10 registered) |
| Aggregation functions | 5 | **9** (MIN, MAX, AVG, SUM, COUNT, FIRST, LAST, MEDIAN, STDDEV) |
| Quality rule types | 3 | **4** (Completeness, Freshness, Range, Consistency) |
| WHK data products | 3 | **3** (Production Context, Inventory-Production Linkage, Equipment Utilization) |
| Ruff violations | 0 | **0** (93 found and fixed during development) |

### What Went Well

1. **In-memory storage abstraction pattern proved reusable.** The `ProductStore`/`InMemoryProductStore` and `LineageStore`/`InMemoryLineageStore` ABCs follow the exact same pattern as Path 5's `TransportChannel`/`InMemoryChannel`. This confirms the pattern as a reliable way to build testable code before infrastructure exists. All 130 tests run in 0.2s with zero external dependencies.

2. **Composable pipeline design enabled rapid iteration.** Each `CurationStep` is independently testable. The pipeline test that combines normalization → time bucketing → aggregation worked correctly on the first try because each step was already verified in isolation.

3. **FastAPI service with dependency injection made testing clean.** The `create_curation_app()` factory accepts all dependencies as arguments. Tests inject in-memory stores and monitors without any mocking. The `httpx.ASGITransport` pattern enables async endpoint tests without starting a real server.

4. **Unit conversion registry handled edge cases gracefully.** The `pre_offset` / `post_offset` pattern for affine conversions (°F→°C) worked cleanly alongside linear conversions. The `inverse` property auto-generates reverse conversions, and the case-insensitive lookup prevents unit mismatch bugs.

### Lessons Learned

1. **Canonical unit case matters.** The `UnitRegistry.set_canonical()` initially lowercased the unit name, but display formatting expected original case (°C not °c). Fixed by preserving original case in canonical storage while keeping lookup case-insensitive.

2. **Ruff's `datetime.UTC` alias (UP017) requires Python 3.11+.** Since the sandbox is 3.10, the conftest patches `datetime.UTC = datetime.timezone.utc`. Ruff's auto-fix rewrites `timezone.utc` → `UTC` throughout, which is correct for the 3.12+ target but requires the patch to exist. This is the same tension seen in Path 5 with StrEnum.

3. **The `DataProduct.schema` field name shadows Pydantic's `BaseModel` attribute.** This produces a warning but is functionally harmless. A future refactor could rename it to `data_schema`, but it's not worth a breaking change now.

4. **Quality SLO evaluation is best done inline.** Initially planned as a separate step, but evaluating quality during each curation batch provides immediate feedback and simplifies the architecture — no separate scheduling needed for the in-memory implementation.

### Deferred Items

- Continuous aggregation scheduling (requires TimescaleDB from F20-F22)
- Real database persistence (PostgreSQL catalog, TimescaleDB time-series)
- Kafka-triggered pipeline execution (event-driven curation)
- FQTS runner implementation (runner infrastructure comes with F13)
- Production Docker Compose service configuration
- Cross-engine join materialization (requires Neo4j from F04)

---

## 9. Documents Accessed

- `PHASES.md` — F40 deliverables and dependencies
- `PLAN.md` — Architecture overview, hub services, design principles
- `src/forge/core/models/data_product.py` — Existing DataProduct model
- `src/forge/core/models/contextual_record.py` — ContextualRecord structure
- `src/forge/core/registry/context_fields.py` — Context field definitions
- `src/forge/core/models/manufacturing/base.py` — ManufacturingModelBase
- `SPRINT-PLAN-PATH5-GRPC-TRANSPORT.md` — InMemoryChannel pattern reference
