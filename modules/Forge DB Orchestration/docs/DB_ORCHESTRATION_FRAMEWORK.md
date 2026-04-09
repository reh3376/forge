# Forge Core DB Orchestration Framework

**Version:** 0.3.0
**Created:** 2026-04-07
**Updated:** 2026-04-07 — added vision: data reliability → model training → autonomous operations
**Owner:** reh3376
**Status:** SPECIFICATION (CONFIRMED)

---

## 1. Directive

> "Any databases that are specifically defined in a repo like NMS or WMS or any other module — the databases should be migrated to the Forge Core DB orchestration framework. All databases must be ultimately controlled by Forge Core to ensure proper collection, governance, storage, curation, and data serving."

### Clarified Requirements (confirmed 2026-04-07)

1. **Forge owns the database instances.** All databases run as Forge-managed pods/containers. Modules connect to Forge-provided databases with permissioned access. Spoke-local database instances are decommissioned after migration.
2. **Forge is the cross-system query hub.** Cross-module queries (barrel + recipe + work order) go through Forge. Spokes continue serving their own local domain queries.
3. **Historical backfill is required.** Existing spoke data (all ~290 models/tables) must be migrated into Forge-managed storage to be the complete source of truth.
4. **Shadow Writer taps adapter output (decoupled).** The Shadow Writer subscribes to the Hub Server's ContextualRecord stream independently. Existing adapters are not modified — persistence is a separate pipeline concern.

### Vision: Data Reliability → Model Training → Autonomous Operations

The primary purpose of centralizing all data under Forge Core is to **maximize reliability** of the curated dataset. Reliable, governed data is a prerequisite for what comes next: training production models with SME (subject matter expert) feedback in the loop. Domain experts validate model outputs against curated ground truth, and those corrections flow back into both the dataset and the models.

The long-term goal is **fully autonomous operations** — manufacturing processes that self-optimize, self-correct, and self-scale with minimal human intervention. This is only achievable when the data foundation is trustworthy end-to-end: every value traceable to its source, every transformation auditable, every schema version-controlled. Forge Core's DB Orchestration Framework is that foundation.

The pipeline:

```
Spoke Data → Forge Governance → Curated Dataset → Model Training (+ SME Feedback) → Autonomous Operations
     │              │                  │                    │                              │
  raw, local    schema-enforced    reliable,          human-in-the-loop             self-optimizing
  divergent     access-controlled  deduplicated       validation & correction       manufacturing
```

This means the standards in this spec — historical completeness, single-writer enforcement, integrity hashing, schema drift detection — are not bureaucratic overhead. They are the minimum bar for data that will train systems making real-time production decisions without a human in the loop.

---

## 2. Spoke Database Inventory

### 2.1 Current State

| Spoke | DB Engine(s) | Schema Tool | Tables/Models | ID Format | Notes |
|-------|-------------|-------------|---------------|-----------|-------|
| **WMS** | PostgreSQL | Prisma ORM | 88 models | CUID | 65+ enums, barrel/inventory domain |
| **MES** | PostgreSQL | Prisma ORM | 84 models | CUID + globalId | ISA-88 recipe hierarchy, 54 enums |
| **ERPI** | PostgreSQL | Prisma ORM | 35 models | CUID + erpId | ERP sync patterns, outbox, raw staging |
| **CMMS** | PostgreSQL | Prisma ORM | 11 models | CUID + int IDs | Dual ID strategy, soft deletes |
| **NMS** | PostgreSQL 16 + Neo4j 5 + Redis 7 | yoyo-migrations | 48 tables | UUID | Python-native, SNMP/LLDP, TimescaleDB-ready |
| **BOSC IMS** | TimescaleDB (PG16) + Neo4j 5 + Redpanda + Redis 7 | golang-migrate | 24 tables | CUIDv2 | Aerospace compliance, event sourcing |
| **Scanner** | None (stateless) | — | 0 | — | Events only, no persistence |
| **NextTrend** | QuestDB + PostgreSQL | Rust (custom) | ~10 tables | — | Time-series historian, ILP writes |

**Total:** ~290 models/tables across 6 independent PostgreSQL instances, 2 Neo4j instances, 2 Redis instances, plus QuestDB and Redpanda.

### 2.2 Schema Overlap Analysis

Several entities appear in multiple spokes with divergent schemas:

| Entity | WMS | MES | ERPI | CMMS | Authoritative Source |
|--------|-----|-----|------|------|---------------------|
| **Item** | ✓ (88 fields) | ✓ (40 fields) | ✓ (35 fields) | ✓ (20 fields) | ERP (via ERPI) |
| **Barrel** | ✓ (primary) | — | ✓ (sync copy) | — | WMS |
| **Recipe** | ✓ (reference) | ✓ (primary) | ✓ (sync copy) | — | MES |
| **ProductionOrder** | — | ✓ (primary) | ✓ (sync copy) | — | MES |
| **Asset** | — | ✓ (minimal) | ✓ (minimal) | ✓ (primary) | CMMS |
| **Vendor** | ✓ | — | ✓ | ✓ | ERP (via ERPI) |
| **Lot** | ✓ (primary) | ✓ (reference) | ✓ (sync copy) | — | WMS |
| **User** | ✓ | ✓ | ✓ | ✓ | WorkOS (via Forge Core) |

---

## 3. Architecture

### 3.1 Design Principles

1. **Forge Core owns every database instance.** All databases run as Forge-managed pods/containers. No spoke runs its own database. Forge provisions, scales, backs up, and monitors every instance.
2. **Permissioned module access.** Each module (WMS, MES, CMMS, etc.) receives connection credentials scoped to the schemas it is authorized to read/write. Forge Core's Access Controller enforces these grants.
3. **Single writer per entity.** Each canonical entity has exactly one authoritative module. The Access Controller enforces this — unauthorized writes are rejected.
4. **Historical completeness.** Forge-managed databases contain the full historical record, not just forward-streaming data. Backfill from existing spoke databases is a required migration step.
5. **Polyglot storage, unified governance.** PostgreSQL, TimescaleDB, Neo4j, Redis, QuestDB, Kafka, and MinIO all operate under Forge's schema registry, migration control, and access governance.
6. **Cross-system queries through Forge, local queries through modules.** Forge provides a federated query layer for cross-module data. Individual modules continue serving their own domain queries against their authorized schemas.
7. **Decoupled persistence.** The Shadow Writer subscribes to the Hub Server's ContextualRecord stream. Adapters are not modified — persistence is an independent pipeline concern.

### 3.2 Three-Phase Migration Model

```
Phase A: OBSERVE               Phase B: PROVISION + BACKFILL       Phase C: OWN
┌───────────────────┐          ┌──────────────────────────────┐    ┌──────────────────────────┐
│ Spoke-local DB    │          │ Forge Pod (new DB instance)  │    │ Forge Pod (authoritative) │
│ (authoritative)   │──adapt─► │                              │    │                           │
│                   │          │ ← Backfill (historical ETL)  │    │ Module app connects       │
│ Forge Adapter     │          │ ← Shadow Writer (real-time)  │    │ directly via permissioned │
│ (read-only)       │          │                              │    │ connection string          │
│                   │          │ Spoke-local DB still active   │    │                           │
│                   │          │ (dual-write validation)       │    │ Spoke-local DB            │
└───────────────────┘          └──────────────────────────────┘    │ decommissioned            │
                                                                   └──────────────────────────┘
 Current state.                 Target: 2026 H2.                    Target: 2027.
 Adapters read spoke DBs.       Forge provisions pods.              Forge is sole DB provider.
 No Forge persistence.          Historical data migrated.           Modules use Forge DBs.
                                Shadow Writer captures live data.
```

**Phase A (OBSERVE)** — Current state. Forge adapters read from spoke databases via REST/GraphQL/AMQP. No Forge-managed database instances exist yet. Schema divergence is tolerated and mapped by adapters.

**Phase B (PROVISION + BACKFILL)** — Forge Core provisions database pods (PostgreSQL, Neo4j, Redis per the storage routing table). The Backfill Engine performs historical ETL from existing spoke databases into Forge-managed instances. The Shadow Writer taps the Hub Server's ContextualRecord stream to capture live changes. Spoke-local databases remain active for dual-write validation: Forge compares its data against the spoke source to verify completeness.

**Phase C (OWN)** — Forge-managed database pods are authoritative. Module applications (WMS NestJS, MES NestJS, NMS FastAPI, etc.) receive Forge-issued connection strings with schema-scoped permissions. Spoke-local database instances are decommissioned. All schema evolution, scaling, backup, and retention are managed exclusively by Forge Core.

### 3.3 Component Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         FORGE CORE DB LAYER                             │
│                                                                          │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────┐ │
│  │ Schema        │  │ Migration     │  │ Access Controller            │ │
│  │ Registry      │  │ Controller    │  │                              │ │
│  │               │  │               │  │ • Per-module permission      │ │
│  │ • Canonical   │  │ • Alembic     │  │   grants (read/write/admin) │ │
│  │   models      │  │   (PG/TSDB)  │  │ • Schema-scoped credentials │ │
│  │ • Version     │  │ • Neo4j      │  │ • Single-writer enforcement  │ │
│  │   tracking    │  │   Cypher     │  │ • Connection string issuer   │ │
│  │ • Integrity   │  │ • Auto-      │  │ • Audit log of all grants   │ │
│  │   hashes      │  │   detect     │  │                              │ │
│  └───────────────┘  └───────────────┘  └─────────────────────────────┘ │
│                                                                          │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────┐ │
│  │ Connection    │  │ Backfill      │  │ Shadow Writer                │ │
│  │ Pool Manager  │  │ Engine        │  │                              │ │
│  │               │  │               │  │ Subscribes to Hub Server's   │ │
│  │ asyncpg, neo4j│  │ Historical    │  │ ContextualRecord stream.     │ │
│  │ redis, minio  │  │ ETL from      │  │ Persists to Forge pods.      │ │
│  │               │  │ spoke DBs.    │  │ Validates consistency.       │ │
│  │ Per-pod pools │  │ Prisma→PG,    │  │                              │ │
│  │ with health   │  │ yoyo→PG,      │  │ Decoupled from adapters —   │ │
│  │ monitoring    │  │ go-migrate→PG │  │ adapters are NOT modified.   │ │
│  └───────────────┘  └───────────────┘  └─────────────────────────────┘ │
│                                                                          │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────┐ │
│  │ Data Router   │  │ Retention     │  │ Query Federation             │ │
│  │               │  │ Manager       │  │                              │ │
│  │ Routes data   │  │               │  │ Cross-engine queries via     │ │
│  │ to correct    │  │ Per-entity    │  │ unified GraphQL schema.      │ │
│  │ storage pod   │  │ TTL, archive  │  │ Resolvers route to correct   │ │
│  │ by data type  │  │ and purge     │  │ Forge-managed storage pod.   │ │
│  └───────────────┘  └───────────────┘  └─────────────────────────────┘ │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Pod Orchestrator                                                 │   │
│  │                                                                  │   │
│  │ Provisions, scales, monitors, and backs up all database pods.    │   │
│  │ Docker Compose (dev) / Kubernetes (prod). Health checks, restart │   │
│  │ policies, volume management, resource limits, observability.     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Storage Engine Routing

Each data type is routed to the optimal Forge-managed storage pod:

| Data Type | Storage Engine | Forge Pod | Examples |
|-----------|---------------|-----------|----------|
| **Master data** (entities, config) | PostgreSQL | `forge-pg` (port 5432) | Item, Recipe, Asset, Vendor, Customer |
| **Transactional data** (events, orders) | PostgreSQL | `forge-pg` (port 5432) | WorkOrder, ProductionOrder, Transfer |
| **Time-series** (sensor, metrics, polls) | TimescaleDB | `forge-tsdb` (port 5433) | SNMP metrics, OPC-UA tags, historian data |
| **Topology/genealogy** (graphs) | Neo4j | `forge-neo4j` (bolt://7687) | Device topology, material genealogy, equipment hierarchy |
| **Hot state** (cache, sessions) | Redis | `forge-redis` (redis://6379) | Current device status, active alerts, session state |
| **Documents/blobs** | MinIO | `forge-minio` (s3://9000) | Certificates, reports, audit exports |
| **Event streams** | Kafka | `forge-kafka` (kafka://9092) | CDC events, adapter output, cross-module events |

### 3.5 Schema Namespace Strategy

Within Forge's PostgreSQL pod, each module gets an isolated schema namespace:

```sql
-- Forge Core schemas
CREATE SCHEMA IF NOT EXISTS forge_core;       -- Platform metadata, schema registry, access control
CREATE SCHEMA IF NOT EXISTS forge_canonical;  -- Canonical entity models (cross-module unified views)

-- Module schemas (each module reads/writes only its own, plus forge_canonical reads)
CREATE SCHEMA IF NOT EXISTS mod_wms;          -- WMS barrel, lot, transfer, customer data
CREATE SCHEMA IF NOT EXISTS mod_mes;          -- MES recipe, production order, scheduling data
CREATE SCHEMA IF NOT EXISTS mod_erpi;         -- ERPI sync, outbox, ERP staging data
CREATE SCHEMA IF NOT EXISTS mod_cmms;         -- CMMS asset, work order, maintenance data
CREATE SCHEMA IF NOT EXISTS mod_nms;          -- NMS device, interface, alert data
CREATE SCHEMA IF NOT EXISTS mod_ims;          -- BOSC IMS asset, compliance, event data

-- Curated data schemas (read-only for modules, written by curation pipeline)
CREATE SCHEMA IF NOT EXISTS curated;          -- Data products, materialized views
CREATE SCHEMA IF NOT EXISTS lineage;          -- Data lineage graph (relational shadow of Neo4j)
```

**Permission model:** WMS app receives credentials granting `SELECT, INSERT, UPDATE, DELETE` on `mod_wms.*` and `SELECT` on `forge_canonical.*`. It cannot read `mod_mes.*` or `mod_cmms.*`. Cross-module data access goes through Forge's Query Federation API.

---

## 4. Access Controller

### 4.1 Purpose

The Access Controller is the permission layer that governs which module can read or write which database schema. It replaces the current model where every spoke app has full admin access to its own database.

### 4.2 Permission Model

```python
class ModulePermission:
    """A database access grant for a Forge module."""
    module_id: str              # e.g., "whk-wms", "whk-mes"
    schema_name: str            # e.g., "mod_wms", "forge_canonical"
    engine: StorageEngine       # Which database pod
    access_level: AccessLevel   # READ, WRITE, ADMIN
    granted_at: datetime
    granted_by: str             # "forge-core" or admin user
    expires_at: datetime | None # Optional TTL for temporary grants
```

### 4.3 Access Levels

| Level | PostgreSQL Grants | Neo4j Grants | Redis Grants |
|-------|-------------------|--------------|--------------|
| **READ** | `SELECT` on schema | `MATCH` (read traversals) | `GET`, `HGET`, `KEYS` |
| **WRITE** | `SELECT, INSERT, UPDATE, DELETE` on schema | `MATCH, CREATE, MERGE, SET` | `GET, SET, HSET, DEL` |
| **ADMIN** | All + `CREATE TABLE, ALTER, DROP` | All + schema management | All + `FLUSHDB` |

### 4.4 Default Grants

| Module | Own Schema (WRITE) | forge_canonical (READ) | Other Schemas |
|--------|-------------------|----------------------|---------------|
| WMS | `mod_wms` | ✓ | None |
| MES | `mod_mes` | ✓ | None |
| ERPI | `mod_erpi` | ✓ | None |
| CMMS | `mod_cmms` | ✓ | None |
| NMS | `mod_nms` | ✓ | None |
| Forge Core | All schemas (ADMIN) | ADMIN | ADMIN |

### 4.5 Connection String Issuer

When a module requests database access, the Access Controller:

1. Validates the module's identity against the Schema Registry.
2. Creates a PostgreSQL role with grants matching the module's permission set.
3. Issues a connection string: `postgresql://mod_wms_rw:<token>@forge-pg:5432/forge?search_path=mod_wms,forge_canonical`
4. Logs the grant to the audit trail.
5. Optionally sets a TTL for credential rotation.

---

## 5. Schema Registry

### 5.1 Purpose

The Schema Registry is the single source of truth for what data Forge manages. Every entity — whether originating from a module, computed by curation, or created by Forge Core — is registered here with its version, authoritative owner, storage routing, and retention policy.

### 5.2 Registry Model

```python
class SchemaEntry:
    schema_id: str              # forge://schemas/<module>/<entity>/v<version>
    module_id: str              # e.g., "whk-wms", "whk-mes", "forge-core"
    entity_name: str            # e.g., "Barrel", "Recipe", "Device"
    version: str                # Semantic version: "1.0.0"
    schema_json: dict           # JSON Schema for the entity
    canonical_model: str | None # Forge canonical model it maps to
    authoritative_module: str   # Which module is the single writer
    storage_engine: StorageEngine
    storage_namespace: str      # Target schema (e.g., "mod_wms")
    retention_policy: str       # "permanent", "7y", "90d", etc.
    integrity_hash: str         # SHA-256 of schema_json for drift detection
    status: SchemaStatus        # DRAFT → REGISTERED → ACTIVE → MIGRATING → DEPRECATED → ARCHIVED
    backfill_status: str        # "not_started", "in_progress", "complete", "failed"
```

### 5.3 Schema Lifecycle

```
DRAFT → REGISTERED → ACTIVE → MIGRATING → DEPRECATED → ARCHIVED
                        │                       │
                        └───── (normal) ────────┘
```

- **DRAFT**: Schema proposed by adapter discovery or backfill scan, not yet approved.
- **REGISTERED**: Schema approved and hashed. Alembic migration generated but not applied.
- **ACTIVE**: Migration applied. Backfill complete or in progress. Shadow Writer accepting live data.
- **MIGRATING**: Schema version bump in progress. Dual-version support active.
- **DEPRECATED**: Old version. Reads still served; writes rejected.
- **ARCHIVED**: Schema and data removed from hot storage, moved to MinIO.

---

## 6. Backfill Engine

### 6.1 Purpose

The Backfill Engine performs historical ETL from existing spoke databases into Forge-managed pods. This is required to make Forge the complete source of truth, not just a forward-looking stream.

### 6.2 Architecture

```
┌─────────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Spoke Source DB      │     │ Backfill Engine    │     │ Forge Pod        │
│ (spoke-local PG,    │────►│                    │────►│ (forge-pg,       │
│  Neo4j, Redis)      │     │ • Schema scanner   │     │  forge-neo4j,    │
│                     │     │ • Table reader     │     │  forge-redis)    │
│ Read-only access    │     │ • Transform/map    │     │                  │
│ (no mutations)      │     │ • Batch writer     │     │ Write via        │
│                     │     │ • Progress tracker │     │ Access Controller│
└─────────────────────┘     │ • Validation       │     └──────────────────┘
                            └───────────────────┘
```

### 6.3 Backfill Strategy Per Spoke

| Spoke | Source | Strategy | Estimated Rows | Complexity |
|-------|--------|----------|----------------|------------|
| **CMMS** | Prisma PG (11 models) | Direct PG→PG COPY, table-by-table | ~50K | Low (proof of concept) |
| **ERPI** | Prisma PG (35 models) | Direct PG→PG COPY, erpId dedup | ~500K | Medium (ERP sync state) |
| **WMS** | Prisma PG (88 models) | Phased: core 15 entities first, then auxiliary | ~5M | High (largest schema) |
| **MES** | Prisma PG (84 models) | Phased: recipe hierarchy first, then operational | ~2M | High (deep nesting) |
| **NMS** | PG + Neo4j + Redis | Multi-engine: PG→PG, Neo4j→Neo4j, Redis→Redis | ~1M (PG) + graph | High (polyglot) |
| **BOSC IMS** | TimescaleDB + Neo4j + Redpanda | Multi-engine + event replay | ~500K + events | High (event sourcing) |

### 6.4 Backfill Process

For each spoke:

1. **Schema Scan**: Read the spoke's schema definition (Prisma schema, SQL migrations, or protobuf) and register in Schema Registry.
2. **Migration Generation**: Auto-generate Alembic migration for the `mod_<spoke>` schema in Forge's PostgreSQL pod.
3. **Apply Migration**: Create tables in Forge-managed pod.
4. **Bulk Copy**: Stream data from spoke source to Forge pod using `pg_dump`/`COPY` (PG→PG), Cypher export/import (Neo4j), or `DUMP`/`RESTORE` (Redis).
5. **Transform**: Apply ID mapping (spoke CUID/UUID → Forge canonical ID), enum normalization, and field mapping.
6. **Validate**: Compare row counts, checksums, and sample records between source and target.
7. **Mark Complete**: Update Schema Registry `backfill_status` to "complete".

### 6.5 Backfill CLI

```bash
forge db backfill scan --spoke wms      # Scan spoke schema, register in registry
forge db backfill plan --spoke wms      # Show migration plan (dry run)
forge db backfill run --spoke wms       # Execute backfill (with progress)
forge db backfill run --spoke wms --tables Barrel,Lot,Item  # Backfill specific tables
forge db backfill validate --spoke wms  # Compare source vs target
forge db backfill status                # Show backfill progress for all spokes
```

---

## 7. Shadow Writer

### 7.1 Purpose

The Shadow Writer captures live data changes after the initial backfill. It subscribes to the Hub Server's ContextualRecord stream (independently of adapters) and persists records to Forge-managed pods.

### 7.2 Data Flow

```
                                    Hub Server
                                        │
                                        │ ContextualRecord stream
                                        │
                              ┌─────────▼──────────┐
                              │   Shadow Writer     │
                              │   (subscriber)      │
                              │                     │
                              │   Decoupled from    │
                              │   adapters — taps   │
                              │   Hub output only   │
                              └──┬──────┬──────┬───┘
                                 │      │      │
                    ┌────────────▼┐  ┌──▼────┐ ┌▼──────────┐
                    │ forge-pg    │  │forge- │ │forge-neo4j │
                    │ (mod_* +   │  │tsdb   │ │            │
                    │  canonical)│  │       │ │            │
                    └────────────┘  └───────┘ └────────────┘
```

### 7.3 Consistency Validation

The Shadow Writer periodically compares Forge pod data against spoke source data (while spoke DBs still exist in Phase B):

- **Row count validation**: Record counts match within tolerance.
- **Hash validation**: SHA-256 of entity payloads match.
- **Freshness validation**: Forge copy is within configured lag tolerance of spoke source.
- **Schema drift detection**: Spoke schema changes that aren't reflected in registry.

Drift events are published to Kafka and surfaced in the Forge governance dashboard.

---

## 8. Migration Controller

### 8.1 Unified Migration System

Forge uses **Alembic** as the single migration controller for all PostgreSQL and TimescaleDB schemas. Neo4j uses Cypher migration scripts. Redis schema is implicit (key patterns documented in registry).

```
forge/
  storage/
    migrations/
      alembic.ini
      env.py
      versions/
        001_forge_core_schema.py        # forge_core schema + schema_entries table
        002_access_control.py           # forge_core.module_permissions + roles
        003_mod_cmms.py                 # CMMS module schema (11 tables)
        004_mod_erpi.py                 # ERPI module schema (35 tables)
        005_mod_wms_core.py             # WMS core entities (15 tables)
        006_mod_wms_auxiliary.py         # WMS auxiliary entities (73 tables)
        007_mod_mes_core.py             # MES core entities
        008_mod_mes_operational.py       # MES operational entities
        009_mod_nms.py                  # NMS module schema (48 tables)
        010_forge_canonical.py          # Cross-module canonical views
        ...
      neo4j/
        001_device_topology.cypher      # NMS device graph
        002_material_genealogy.cypher   # WMS/MES material lineage
        003_asset_hierarchy.cypher      # CMMS/IMS asset tree
        ...
```

### 8.2 CLI Integration

```bash
forge db status                        # Show migration + backfill state for all engines
forge db migrate                       # Apply pending migrations (all engines)
forge db migrate --module wms          # Apply only WMS module migrations
forge db rollback --steps 1            # Rollback last migration
forge db generate --from-facts whk-wms.facts.json  # Auto-generate migration from FACTS spec
forge db drift-check                   # Compare module schemas against registry
forge db audit                         # Generate compliance report of all schema changes
forge db access grant wms mod_wms WRITE  # Grant WMS module write access to mod_wms schema
forge db access revoke wms mod_mes     # Revoke WMS access to MES schema
forge db access list                   # Show all module permission grants
```

---

## 9. Retention Manager

### 9.1 Per-Entity Retention Policies

| Category | Default Retention | Archive Strategy | Examples |
|----------|-------------------|------------------|----------|
| **Master data** | Permanent | Version history kept | Item, Recipe, Asset, Vendor |
| **Transactional** | 7 years | Archive to MinIO after 2 years | WorkOrder, ProductionOrder, Transfer |
| **Operational events** | 1 year | Aggregate → TimescaleDB continuous agg | SNMP traps, alerts, scan events |
| **Time-series** | Tier-based | Raw → 90d, 1m avg → 1y, 1h avg → 7y | Sensor data, OPC-UA tags |
| **Audit logs** | 10 years (ISO) | Immutable append, MinIO archive | All schema changes, data mutations |
| **Cache/state** | Session-scoped | No archive | Redis hot state |

---

## 10. Query Federation

### 10.1 Dual Query Model

**Local queries:** Each module queries its own schema directly using its Forge-issued connection string. WMS queries `mod_wms.barrels`, MES queries `mod_mes.recipes`. No change to existing module query logic — just a different connection string pointing to a Forge pod instead of a spoke-local DB.

**Cross-system queries:** Forge exposes a unified GraphQL API that resolves across all storage engines. This is the only way to join data across modules.

### 10.2 Cross-Engine Query Examples

```graphql
type Query {
  # Cross-module: barrel (WMS) + its recipe (MES) + ERP sync status (ERPI)
  barrelFullContext(barrelId: ID!): BarrelContext

  # Cross-engine: device (Neo4j) + its metrics (TimescaleDB) + its alerts (PostgreSQL)
  deviceDashboard(deviceId: ID!): DeviceDashboard

  # Federated search: find all entities related to a lot number across all modules
  traceByLot(lotNumber: String!): TraceResult
}
```

---

## 11. Spoke Migration Playbook

### 11.1 Migration Order

CMMS first (smallest, proves pattern), then ERPI (data backbone), then WMS (largest), then MES, then NMS (polyglot), then BOSC IMS.

### 11.2 CMMS (11 Prisma models → Forge Pod) — Proof of Concept

| Step | Action | Timeline |
|------|--------|----------|
| B.1 | Provision `mod_cmms` schema in Forge PG pod | 2026 Q3 |
| B.2 | Backfill: `pg_dump` → transform → `COPY` into `mod_cmms` | 2026 Q3 |
| B.3 | Shadow Writer captures live CMMS changes | 2026 Q3 |
| B.4 | Validate: row counts, checksums, dual-write comparison | 2026 Q3 |
| C.1 | Issue Forge connection string to CMMS NestJS app | 2026 Q3-Q4 |
| C.2 | CMMS app switches from spoke-local PG to Forge PG pod | 2026 Q4 |
| C.3 | Decommission CMMS spoke-local PostgreSQL | 2026 Q4 |

**Key challenge:** Dual-ID strategy (CUID + int). The int IDs are auto-incremented and may conflict if CMMS has multiple environments. Forge uses CUID as the canonical ID; int IDs become a `legacy_int_id` column.

### 11.3 ERPI (35 Prisma models → Forge Pod)

| Step | Action | Timeline |
|------|--------|----------|
| B.1 | Provision `mod_erpi` schema in Forge PG pod | 2026 Q3 |
| B.2 | Backfill: 35 tables, erpId correlation, outbox state | 2026 Q3-Q4 |
| B.3 | Shadow Writer via ERPI adapter's RabbitMQ stream | 2026 Q4 |
| C | ERPI app switches to Forge PG pod | 2027 Q1 |

### 11.4 WMS (88 Prisma models → Forge Pod)

| Step | Action | Timeline |
|------|--------|----------|
| B.1 | Provision `mod_wms` schema — core 15 entities first | 2026 Q3 |
| B.2 | Backfill core: Barrel, Lot, Item, Customer, Transfer, etc. | 2026 Q3-Q4 |
| B.3 | Backfill auxiliary: remaining 73 tables | 2026 Q4 |
| B.4 | Shadow Writer + validation | 2026 Q4 |
| C | WMS app switches to Forge PG pod | 2027 Q1 |

### 11.5 MES (84 Prisma models → Forge Pod)

| Step | Action | Timeline |
|------|--------|----------|
| B.1 | Provision `mod_mes` schema — recipe hierarchy first | 2026 Q4 |
| B.2 | Backfill: ISA-88 hierarchy preserved (Recipe→Procedure→...→Parameter) | 2026 Q4 |
| C | MES app switches to Forge PG pod | 2027 Q2 |

### 11.6 NMS (48 tables + Neo4j + Redis → Forge Pods)

| Step | Action | Timeline |
|------|--------|----------|
| B.1 | Provision `mod_nms` in PG pod, NMS labels in Neo4j pod, NMS keys in Redis pod | 2026 Q4 |
| B.2 | Multi-engine backfill: PG→PG, Neo4j→Neo4j, Redis→Redis | 2026 Q4-2027 Q1 |
| C | NMS app switches to Forge pods | 2027 Q2 |

### 11.7 BOSC IMS (24 tables + Neo4j + Redpanda → Forge Pods)

| Step | Action | Timeline |
|------|--------|----------|
| B.1 | Provision `mod_ims` in PG pod + Neo4j pod | 2027 Q1 |
| B.2 | Backfill + event replay from Redpanda → Kafka | 2027 Q1-Q2 |
| C | IMS app switches to Forge pods | 2027 Q3 |

---

## 12. FxTS Governance: FDBS (Forge Database Spec)

A new governance spec family for database orchestration:

```json
{
  "spec_version": "0.2.0",
  "spec_type": "FDBS",
  "module_id": "whk-wms",
  "schemas": [
    {
      "namespace": "mod_wms",
      "engine": "postgresql",
      "tables": ["barrels", "lots", "items", "customers", "transfers"],
      "canonical_mappings": {
        "barrels": "forge_canonical.manufacturing_units",
        "items": "forge_canonical.material_definitions",
        "lots": "forge_canonical.material_lots"
      },
      "retention": "7y",
      "migration_ref": "forge://migrations/mod_wms/v001",
      "backfill_required": true
    }
  ],
  "access_grants": [
    { "module_id": "whk-wms", "schema": "mod_wms", "level": "WRITE" },
    { "module_id": "whk-wms", "schema": "forge_canonical", "level": "READ" }
  ],
  "consistency_checks": [
    {
      "type": "row_count",
      "source": "mod_wms.barrels",
      "target": "whk-wms-spoke.Barrel",
      "tolerance_pct": 0.1,
      "phase": "B"
    }
  ],
  "integrity": {
    "hash_method": "sha256-c14n-v1",
    "spec_hash": null,
    "approved_by": null
  }
}
```

---

## 13. Implementation Priority

| Priority | Component | Depends On | Effort |
|----------|-----------|------------|--------|
| **1** | Schema Registry + Access Controller | Alembic setup | Medium |
| **2** | Migration Controller + CLI (`forge db *`) | Schema Registry | Medium |
| **3** | Connection Pool Manager (per-pod pools) | — | Small |
| **4** | Backfill Engine (Phase B historical ETL) | Schema Registry + Pools | Large |
| **5** | Shadow Writer (Phase B live capture, decoupled from adapters) | Schema Registry + Pools + Hub Server | Medium |
| **6** | CMMS migration (proof of concept: 11 models) | Backfill Engine + Shadow Writer | Small |
| **7** | ERPI migration (data backbone: 35 models) | CMMS proven | Medium |
| **8** | WMS migration (largest: 88 models, phased) | Pattern proven | Large |
| **9** | MES migration (84 models, ISA-88 hierarchy) | Pattern proven | Large |
| **10** | NMS migration (polyglot: PG + Neo4j + Redis) | Pattern proven | Large |
| **11** | Query Federation (cross-module GraphQL) | Module schemas populated | Large |
| **12** | Retention Manager | All modules migrated | Medium |
| **13** | FDBS governance spec family | FxTS framework | Medium |

---

## 14. Non-Negotiable Rules

1. **Forge Core owns every database instance.** No module runs its own database pod. All instances are provisioned, scaled, backed up, and monitored by Forge Core.
2. **Permissioned access only.** Every module connects with Forge-issued credentials scoped to its authorized schemas. No superuser access for modules.
3. **Every schema change goes through Alembic.** No manual DDL against Forge databases. No Prisma `migrate dev` against Forge pods.
4. **Schema Registry hash integrity.** Every registered schema has a SHA-256 hash. Drift triggers governance alerts and blocks writes.
5. **Single writer per entity.** The `authoritative_module` field in the registry is enforced by the Access Controller at write time.
6. **Historical completeness.** Backfill is a required step, not optional. A module's schema is not marked ACTIVE until backfill validation passes.
7. **Module namespace isolation.** Modules cannot read or write other modules' schemas. Cross-module data access goes through `forge_canonical` views or the Query Federation API.
8. **Audit everything.** Every migration, permission grant, backfill operation, schema change, retention action, and drift detection is logged immutably.
9. **Adapters are not modified for persistence.** The Shadow Writer is decoupled — it subscribes to the Hub Server's output stream. Adapter code remains focused on data collection and context enrichment.

---

*This specification is confirmed as of 2026-04-07 based on direct directive clarification. The CMMS migration (Priority 6) will validate the full pattern before proceeding to larger spokes.*
