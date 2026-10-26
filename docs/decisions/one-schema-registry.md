# One schema registry — design record

**Status:** draft for the owner's signature, round 1 (2026-10-26) · **Backlog:** FB-097 (pairs with FB-009 and the FDTS gate) · **Roadmap:** D-10
**Participants:** reh3376 (owner, decides and signs), Claude (researches, proposes)

This record designs the convergence of Forge's two schema registries into one: what a schema is, what the hub knows about where its records live and who owns them, how the hub routes by it, who registers schemas and under which gate. Every statement is tagged **[FACT]** (what the code says, with its source in §7), **[PROPOSED]** (Claude's recommendation, not yet approved) or **[OPEN]** (a question the owner must answer). Nothing in §4 to §6 is implemented until the status line reads `approved by reh3376 on <date>`; the owner signs by editing that line, nobody signs on the owner's behalf.

---

## 1. What exists today (2026-10-26)

[FACT] Two packages each call themselves the Schema Registry.

| | F20 Schema Registry (`forge.registry`) | Storage routing registry (`forge.storage.registry`) |
|---|---|---|
| Unit | `SchemaMetadata`, one per schema id, holding immutable `SchemaVersion`s | `SchemaEntry`, one per version ref |
| Id | `forge://schemas/<spoke>/<Entity>`; the registry assigns integer versions | `forge://schemas/<spoke>/<Entity>/v<semver>`; the version is part of the id |
| Carries | the schema document and an integrity hash per version; compatibility mode (`BACKWARD`, `FORWARD`, `FULL`, `NONE`); schema type (`adapter_output`, `data_product`, `api`, `event`, `governance`); owner, description, tags; `status`, a free string defaulting to `"active"` | the schema document and one integrity hash; `authoritative_spoke`; `storage_engine` (six engines); `storage_namespace`; `retention_policy` (seven values, default seven years); `canonical_model`; `status` from `SchemaStatus` (`draft`, `registered`, `active`, `migrating`, `deprecated`, `archived`) |
| Served | nine routes under `/v1/schemas` on the hub (FB-001); state changes behind `schemas:write`; 28 FATS specs cover them | no route |
| Persisted | `forge_core.registry_schemas` and `registry_versions` (migration 009, FB-005) through `PostgresSchemaStore`, handed to the hub by the storage factory | never. `SchemaRegistry` is a dict. `forge_core.schema_entries` (migration 001, "mirrors SchemaEntry") is written by nothing. The "Phase 2" `PostgresSchemaRegistry` the docstring promises does not exist |
| Written by | the API; no adapter, module or test fixture registers a schema at runtime | nothing under `src/` constructs a `SchemaEntry`; only its tests do |
| Read by | the API | `DataRouter`, which `IngestPipeline` builds over a new, empty `SchemaRegistry()` on every hub start |
| Tests | the registry and API suites (FB-001, FB-095) | 21 in `tests/storage/test_registry.py`, 9 in `test_router.py`, 2 end-to-end |

[FACT] How the hub routes a record today (`forge.storage.router.DataRouter.route`): first the routing registry, by `(spoke, entity)`, which never matches because the registry is empty; then `_DEFAULT_ROUTES`, a table of ten `value.data_type` strings (`snmp_metric`, `opc_ua_tag`, `historian_point`, `sensor_reading` → TimescaleDB; `device_topology`, `equipment_hierarchy`, `material_genealogy` → Neo4j; `cdc_event`, `adapter_event` → Kafka); then PostgreSQL. The decision's namespace is `spoke_<spoke_id>` (for example `spoke_whk-wms`), which names no schema any migration creates (002 creates `mod_wms`, `mod_mes`, …).

[FACT] What the decision buys: `build_pipeline_from_storage` gives the TimescaleDB and PostgreSQL engines the same sink, `forge_ts.contextual_records`; Neo4j gets the graph writer; Kafka, Redis and MinIO fall through to the in-memory sink. `target_namespace` is read only by the shadow writer's metrics. `retention_policy` is read by nothing. `RedisSchemaCache` caches "schema entries" nobody writes. `SchemaStatus` is used only by the storage registry; the F20 `status` is a free string.

[FACT] The entity name of a record is `context.extra["entity_type"]` or, failing that, the second segment of the tag path (`wms.barrel.create.cuid` → `barrel`). The names a registry would hold are the FACTS `data_sources[].entities` names (`Barrel`, `BarrelFill`, …). The whk-cmms adapter stamps `entity_type` with mapper-chosen values (`item`, `kit`, `work_order_type`, `inventory_location`); the forge-mes adapter passes the raw `entity_type` through; the end-to-end test accepts `barrel` or `unknown`. No record today carries the name a registry entry would be found by.

[FACT] FB-008 gave both registries one id grammar, `forge://schemas/<spoke>[/<Entity>][/v<version>]`, with three roles: the contract ref (`…/<spoke>/v<version>`, what an adapter emits as a whole; the FACTS `data_contract.schema_ref`, the manifest's `DataContract.schema_ref`, `RecordLineage.schema_ref` on every record), the schema id (`…/<spoke>/<Entity>`, one F20 schema) and the version ref (`…/<spoke>/<Entity>/v<version>`: an integer names a registry version, a semantic version names a routing entry). The grammar encodes the split.

[FACT] FACTS declares, per spoke, the contract ref, the required and optional context fields and the entity names each data source carries. It declares no per-entity schema document, no engine, no namespace, no retention. The manifest (`forge.core.models.adapter.DataContract`, `src/forge/proto/adapter.proto`) carries the same three things.

[FACT] Data products (FB-009, FB-086) reference a schema by `schema_ref` as a contract ref (`forge://schemas/production-context/v2`); curated records come back through `IngestPipeline.persist` and the same router. The F20 package already implements the compatibility checks and the version diff that FDTS (planned, doc pages only) would run.

## 2. The problem, precisely

1. Forge has two definitions of "a schema", with different version schemes (integers assigned by the registry; semantic versions in the id), two statuses, two hashes and two stores. FB-008 could make their ids one grammar; it could not make them one thing.
2. The metadata the hub needs to route, keep and attribute records (engine, namespace, retention, authoritative spoke) lives in the registry that is dead. The hub has never routed a record by a schema. Every record goes by its `data_type` or to PostgreSQL, and PostgreSQL and TimescaleDB are the same table.
3. Nobody can ask the hub where an entity's records live, how long they are kept, or which spoke writes them. The vision's Schema Registry row and FB-057 step 2 (hub-owned DDL for the modules) need those answers.
4. A third copy is about to be written: the Go forge-mes module (FB-076) and the module SDK must register their schemas, and today they would have to choose between two registries that disagree about what a version is.

## 3. Options considered

| | Option | Verdict |
|---|---|---|
| A | Persist the routing registry as it is: write `schema_entries`, build the promised `PostgresSchemaRegistry`. | Rejected. Two ids per schema, two version schemes, two statuses, two hashes; the convergence problem stays and gains a table. |
| B | Fold routing into the F20 schema as a facet, retire the routing registry, route from the F20 store. | **Recommended.** One id, one version scheme, one lifecycle, one store, one API, one place for the Go module to register. |
| C | Declare routing in FACTS, the spoke's own spec. | Rejected as the authority. FACTS is the spoke's declaration of what it emits; where the hub stores it, how long it keeps it and who is authoritative is hub policy, decided by the owner or the hub operator. FACTS proposes (its entity names seed the schema ids); the registry decides. |

## 4. Proposed design

| # | Proposal | Tag |
|---|---|---|
| P-1 | **One registry.** `forge.registry` is the Schema Registry. `forge.storage.registry` (`SchemaEntry`, `SchemaRegistry`) and `RedisSchemaCache` are retired. `StorageEngine`, `RetentionPolicy` and `SchemaStatus` move to `forge.registry.models`; storage imports them from there (no cycle: `registry.models` imports only `core.schema_ref`). | [PROPOSED] |
| P-2 | **The placement facet.** `SchemaPlacement(engine, namespace, retention, authoritative_spoke)` on `SchemaMetadata.placement`, `None` for an unplaced schema. "Placement" says where the schema's records live and who writes them; routing is what the hub does with it. Persisted as four columns on `registry_schemas` by migration 012, which also drops the `schema_entries` table (its downgrade restores it as 001 defined it). Served by the existing routes: `POST /v1/schemas` accepts it, every `GET` returns it, and `PUT /v1/schemas/{schema_id}/placement` (behind `schemas:write`, with its FATS spec) changes it. | [PROPOSED] |
| P-3 | **One lifecycle.** `SchemaMetadata.status` becomes `SchemaStatus`; today's `"active"` maps to `ACTIVE`. The hub routes by `ACTIVE`, `MIGRATING` and `DEPRECATED` schemas (records still arrive for all three; a deprecated one is reported); `DRAFT`, `REGISTERED` and `ARCHIVED` do not route. | [PROPOSED] |
| P-4 | **Routing from the registry.** `DataRouter` consults a `PlacementTable`: an in-process snapshot `(spoke, Entity) → placement` built from the schema store when the pipeline starts and rebuilt when the registry service writes (same process: the service invalidates the table; a second hub process, when there is one, learns of it through the same channel FB-092 gives hub-to-hub links). Resolution: an ACTIVE placement; else `DEFAULT_PLACEMENT`, today's `_DEFAULT_ROUTES` moved next to the registry as the hub's default policy; else PostgreSQL. The decision's `reason` names the schema id or the default rule, as today. The default namespace is the spoke's own schema as `forge db access` names it (`mod_<x>`), not `spoke_<id>`. | [PROPOSED] |
| P-5 | **Entity names.** The FACTS entity names, exact (`Barrel`), are the registry's `<Entity>`. Every record carries `context.extra["entity_type"]` with that exact name; the tag-path fallback stays through the transition, is reported when used, then goes. | [PROPOSED] |
| P-6 | **Registration.** The manifest grows `schemas: list[SchemaDeclaration]` (entity, JSON Schema document, proposed placement). At `Register` the hub registers each as `forge://schemas/<adapter_id>/<Entity>`, adding a version only when the document changed, under the gate of P-7. The proposed placement is taken only for a schema the hub has not seen; changing a placement afterwards is the operator's `PUT`. The module SDK generates the declarations from the module's models (Go: the FB-016 models; Python: the Pydantic models). | [PROPOSED] |
| P-7 | **The FDTS gate.** At registration a new version is checked against the latest under the schema's compatibility mode (`forge.registry.compatibility`); an incompatible version is refused, with the diff in the error, and the adapter's registration fails closed. FDTS as a governance suite (spec, runner, `forge governance fdts`) formalises the same check later; this gate is its first instance. | [PROPOSED] |
| P-8 | **Data products.** A product's output schema registers as `forge://schemas/<product_id>/<Entity>` with `schema_type = data_product` when the product is published (FB-009's engine does it); its placement decides where curated records land. | [PROPOSED] |
| P-9 | **Retention.** Recorded on the facet now; enforced later by a hub job (per-entity deletion on the shared hypertable, or per-entity hypertables once the FB-076 modules need them). | [PROPOSED] |
| P-10 | **Unplaced records.** Through the transition the hub routes by defaults and reports every `(spoke, Entity)` seen without an ACTIVE schema in the health report. Once every registered adapter declares its schemas, a hub setting the owner flips makes the hub refuse records whose schema is not ACTIVE: the owner's posture, checks mandatory and fail closed. | [PROPOSED] |

What P-1 to P-4 change for FB-008: the version ref `forge://schemas/<spoke>/<Entity>/v<n>` names a registry version only; the grammar keeps accepting a semantic version there (adapters' contract refs use them) but no role reads it as a routing entry. `forge.core.schema_ref`'s docstring and `SchemaRef.role` say so.

## 5. Implementation steps (after signature, one PR each)

1. Enums move, `SchemaPlacement`, `SchemaStatus` on `SchemaMetadata`, the store and the routes, migration 012, the new route's FATS spec; tests for all of it.
2. `PlacementTable`, `DataRouter` over it, `DEFAULT_PLACEMENT`, pipeline wiring from the factory's schema store, invalidation on write.
3. Retire `forge.storage.registry` and `RedisSchemaCache`; the shadow writer, the end-to-end tests and `schema_ref` follow.
4. Manifest `schemas`, the proto, `Register` under the compatibility gate (Q-1, Q-2).
5. Entity naming across adapters (Q-3): whk-cmms mapper values, forge-mes passthrough, the tag-path fallback.
6. Data-product schema registration on publish (P-8).
7. Unplaced-record reporting, then the refusal setting (Q-8).
8. The retention job (Q-5), when retention is first needed.

Steps 1 to 3 carry no open question and could start on the signature alone; 4 to 8 need the answers below.

## 6. Open questions for the owner

| # | Question | Proposed answer |
|---|---|---|
| Q-1 | Who registers schemas: the adapter's manifest at `Register` (P-6), the operator through the API, or the SDK at build time writing a file the hub loads? | P-6: the manifest, generated by the SDK, registered by the hub at `Register`; the API for operator changes. |
| Q-2 | Does the compatibility gate refuse an incompatible version from day one, failing the adapter's registration (P-7), or only report it until FDTS exists as a suite? | Refuse from day one; a reported-only check is the kind of warning the one-clock principle rejected. |
| Q-3 | Does `entity_type` become a required FACTS context field, so every record names its entity exactly (P-5)? | Yes; the FACTS schema and every spec gain it, under the owner's re-approval of each spec hash. |
| Q-4 | Is placement hub authority: the spoke proposes once, the operator (`schemas:write`) decides afterwards? | Yes (P-6). |
| Q-5 | Is per-entity retention needed before FB-076's modules land, or is recording it enough for now (P-9)? | Record now, enforce with the modules. |
| Q-6 | What does `namespace` mean physically while every record lands in one hypertable: the logical owner schema (`mod_<x>`, the one FB-057 grants on), or a future physical location? | The logical owner schema; FB-057 step 2 makes it physical for module-owned tables. |
| Q-7 | Is the six-state `SchemaStatus` the one lifecycle, with the routing rule of P-3? | Yes. |
| Q-8 | After the transition, does the hub refuse records whose schema is not ACTIVE (P-10), and who flips the setting? | Yes; the owner flips it per hub once the health report shows no unplaced records. |

## 7. Sources

- `src/forge/registry/models.py`, `store.py`, `postgres_store.py`, `service.py`, `compatibility.py` — the F20 registry.
- `src/forge/storage/registry.py`, `router.py`, `shadow.py`, `engines/redis_engine.py` — the routing registry, the router, their readers.
- `src/forge/ingest/pipeline.py` (`IngestPipeline.__init__`, `build_pipeline_from_storage`) — the empty registry on every start; the sinks per engine.
- `src/forge/storage/migrations/versions/001_forge_core_schema.py` (`schema_entries`), `009_registry_and_equipment_tables.py` (`registry_schemas`, `registry_versions`).
- `src/forge/core/schema_ref.py` — the grammar and its three roles (FB-008).
- `src/forge/governance/facts/schema/facts.schema.json` (`data_contract`), `src/forge/governance/facts/specs/whk-wms.facts.json` — what a spoke declares.
- `src/forge/core/models/adapter.py` (`DataContract`, `AdapterManifest`), `src/forge/proto/adapter.proto` — the manifest.
- `src/forge/adapters/whk_cmms/`, `src/forge/adapters/forge_mes/record_builder.py` — who stamps `entity_type` and with what.
- `src/forge/core/models/data_product.py` (`schema_ref`), `src/forge/curation/engine.py` — data products and curation (FB-009, FB-086).
- `tests/storage/test_registry.py`, `test_router.py`, `tests/integration/test_end_to_end.py` — what the current behaviour pins.
- `docs/VISION.md` §Schema Registry and FDTS; `BACKLOG.md` FB-057, FB-076, FB-097.
