# ERPI Spoke Discovery — whk-erpi

**Date:** 2026-04-07
**Source repo:** `WhiskeyHouse/whk-erpi`
**Onboarding priority:** P1 (weighted score 41)
**Status:** Discovery complete, ready for FACTS spec

---

## 1. System Overview

whk-erpi is the **bidirectional ERP integration service** connecting WHK's manufacturing systems (WMS, MES, CMMS) to NetSuite ERP. It is the backbone of cross-system data flow — every module that needs financial, inventory, or master data routes through ERPI.

**Architecture:** NestJS 11 backend with RabbitMQ event-driven messaging + NetSuite REST/RESTlet polling. No frontend — this is a headless integration service.

---

## 2. Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | NestJS | 11.1.9 |
| Language | TypeScript | 5.5.4 |
| ORM | Prisma | 5.11.0 |
| Database | PostgreSQL | 12 |
| Message Broker | RabbitMQ | 3.x (amqplib 0.10.9) |
| Cache | Redis 7 | keyv 5.5.4 + @keyv/redis |
| Auth | JWT (passport-jwt) | 4.0.1 |
| ERP Auth | NetSuite OAuth 1.0 | HMAC-SHA256 |
| GraphQL | Apollo Server | 5.2.0 |
| Observability | OpenTelemetry | 0.41.2 |
| Logging | Winston + Pino | |
| APM | New Relic (optional) | |

---

## 3. RabbitMQ Topics (36 total)

### Topic Naming Convention

All entity topics follow: `wh.whk01.distillery01.<entityname>` (lowercase, no separators in entity name).

This is a **proto-UNS** (Unified Namespace) hierarchy. The Forge adapter can subscribe to these topics as-is.

### Entity Topics (33)

| # | Topic | Entity | Active Consumer | Producer |
|---|-------|--------|-----------------|----------|
| 1 | `wh.whk01.distillery01.purchaseorder` | PurchaseOrder | — | Yes |
| 2 | `wh.whk01.distillery01.productionorder` | ProductionOrder | — | Yes |
| 3 | `wh.whk01.distillery01.asset` | Asset | — | Yes |
| 4 | `wh.whk01.distillery01.item` | Item | Yes | Yes |
| 5 | `wh.whk01.distillery01.itemreceipt` | ItemReceipt | Yes | Yes |
| 6 | `wh.whk01.distillery01.inventory` | Inventory | Yes* | — |
| 7 | `wh.whk01.distillery01.inventorytransfer` | InventoryTransfer | Yes* | — |
| 8 | `wh.whk01.distillery01.salesorder` | SalesOrder | — | Yes |
| 9 | `wh.whk01.distillery01.account` | Account | — | — |
| 10 | `wh.whk01.distillery01.bom` | Bom | — | Yes |
| 11 | `wh.whk01.distillery01.bomitem` | BomItem | — | Yes |
| 12 | `wh.whk01.distillery01.recipe` | Recipe | — | Yes |
| 13 | `wh.whk01.distillery01.recipeparameter` | RecipeParameter | — | Yes |
| 14 | `wh.whk01.distillery01.recipegroup` | RecipeGroup | — | Yes |
| 15 | `wh.whk01.distillery01.productionorderunitprocedure` | ProductionOrderUnitProcedure | Yes | — |
| 16 | `wh.whk01.distillery01.barrel` | Barrel | Yes | — |
| 17 | `wh.whk01.distillery01.itemgroup` | ItemGroup | — | Yes |
| 18 | `wh.whk01.distillery01.kit` | Kit | Yes | — |
| 19 | `wh.whk01.distillery01.lot` | Lot | Yes | — |
| 20 | `wh.whk01.distillery01.location` | Location | Yes | — |
| 21 | `wh.whk01.distillery01.barrelevent` | BarrelEvent | Yes | — |
| 22 | `wh.whk01.distillery01.unitprocedure` | UnitProcedure | Yes | — |
| 23 | `wh.whk01.distillery01.operation` | Operation | Yes | — |
| 24 | `wh.whk01.distillery01.equipmentphase` | EquipmentPhase | Yes | — |
| 25 | `wh.whk01.distillery01.productionschedule` | ProductionSchedule | Yes | — |
| 26 | `wh.whk01.distillery01.scheduleorder` | ScheduleOrder | Yes | — |
| 27 | `wh.whk01.distillery01.schedulequeue` | ScheduleQueue | Yes | — |
| 28 | `wh.whk01.distillery01.barrelreceipt` | BarrelReceipt | Yes | — |
| 29 | `wh.whk01.distillery01.batch` | Batch | — | — |
| 30 | `wh.whk01.distillery01.vendor` | Vendor | — | Yes |

*\* inventory and inventorytransfer consumers are commented out in controller — topics defined but not actively consumed.*

### Acknowledgment & Control Topics (3)

| # | Topic | Purpose |
|---|-------|---------|
| 31 | `message_acknowledgment` | General business-level acknowledgments |
| 32 | `erpi.netsuite.operation.ack` | NetSuite operation success |
| 33 | `erpi.netsuite.operation.error` | NetSuite operation failure |

### Microservice Consumer Binding (16 active)

These topics are bound to dedicated RabbitMQ transport strategies in `connectMicroservices.ts`:

```
itemreceipt, item, inventory, inventorytransfer,
productionorderunitprocedure, barrel, kit, lot,
barrelevent, unitprocedure, operation, equipmentphase,
productionschedule, scheduleorder, schedulequeue, barrelreceipt
```

---

## 4. Message Envelope Schema

### Standard Envelope

```typescript
interface RabbitMQEnvelope<TPayload> {
  event_type: "create" | "update" | "delete" | "large_quantity_update";
  data: TPayload;
  recordName: string;
  id?: string;
  messageId?: string;
}

interface RabbitMQRecord<TPayload> {
  data: RabbitMQEnvelope<TPayload>;
  options?: {
    headers?: Record<string, string>;
    priority?: number;
  };
}
```

### ERPI Transaction Fields (on all entity payloads)

Every entity payload includes these required fields (enforced by the type system):

| Field | Type | Values |
|-------|------|--------|
| `transactionInitiator` | string | `"WH"` \| `"ERP"` |
| `transactionStatus` | string | `"PENDING"` \| `"SENT"` \| `"CONFIRMED"` |
| `transactionType` | string | `"CREATE"` \| `"UPDATE"` \| `"DELETE"` |

### Contract Source of Truth

Message schemas are defined in **AsyncAPI format** in a git submodule:
- Location: `server/contracts/` → `whk-asyncapi-types`
- Schema: `asyncapi.yaml`
- Generated types: `dist/asyncapi.generated.ts`
- Type wrapper: `RabbitMQPayloadForTopic<TTopic>` provides compile-time validation

---

## 5. Exchange Architecture

| Property | Value |
|----------|-------|
| Exchange type | **Fanout** (each topic is its own exchange) |
| Durability | Durable exchanges, durable queues |
| Consumer group | Named queue per group (default: `whk-erpi`) |
| Acknowledgment | Manual (`channel.ack()` after success) |
| Persistence | All messages marked persistent |
| Routing | Empty routing key (fanout broadcasts to all bound queues) |

**Forge adapter implication:** The fanout architecture means Forge can bind its own durable queue to each exchange without affecting existing consumers. This is the ideal passive-consumption pattern.

---

## 6. Data Models (40 Prisma models)

### Core Business Entities

| Entity | Key Fields | Cross-System ID |
|--------|-----------|-----------------|
| Item | name, type, category, UOM | `globalId` (unique) |
| ItemReceipt | quantity, receiptDate, status | `globalId` |
| ItemGroup | name, description | `globalId` |
| Inventory | quantity, location, item | `globalId` |
| InventoryTransfer | fromLocation, toLocation, quantity | `globalId` |
| PurchaseOrder | vendor, items, status, total | `globalId` |
| SalesOrder | customer, items, status, total | `globalId` |
| ProductionOrder | recipe, status, quantities | `globalId` |
| Barrel | barrelNumber, type, contents, status | `globalId` |
| BarrelEvent | eventType, barrel, timestamp | `globalId` |
| BarrelReceipt | barrel, receipt details | `globalId` |
| Lot | lotNumber, item, quantity | `globalId` |
| Kit | name, components | `globalId` |
| Bom | name, recipe, items | `globalId` |
| BomItem | bom, item, quantity | `globalId` |
| Recipe | name, parameters, bom | `globalId` |
| RecipeParameter | recipe, name, value | `globalId` |
| RecipeGroup | name, recipes | `globalId` |
| Vendor | name, contact info | `globalId` |
| Customer | name, contact info | `globalId` |
| Asset | name, type, location, status | `globalId` |
| Location | name, type, address | `globalId` |
| Account | name, type, balance | `globalId` |
| Batch | batchNumber, details | `globalId` |

### ISA-88 Manufacturing Entities

| Entity | Purpose |
|--------|---------|
| UnitProcedure | Top-level production procedure |
| Operation | Step within a unit procedure |
| EquipmentPhase | Equipment-specific phase execution |
| ProductionOrderUnitProcedure | Links production orders to unit procedures |
| ProductionSchedule | Production scheduling |
| ScheduleOrder | Individual scheduled order |
| ScheduleQueue | Queue position for scheduled orders |

### Integration-Specific Models

| Model | Purpose |
|-------|---------|
| NetSuiteOutbox | Outbox pattern — reliable NetSuite delivery |
| NetSuiteOutboxAuditLog | Audit trail for outbox operations |
| ErpSyncErrorLog | Error tracking for ERP sync operations |
| ErpSyncHistory | Historical sync operation records |
| RecipeErpRaw | Raw ERP recipe data (before transformation) |
| MashingProtocol / MashingProtocolStep / MashingProtocolErpRaw | Mashing-specific protocol data |

### Common Entity Pattern

Every core entity includes:
- `id: String @id @default(cuid())` — CUID primary key
- `globalId: String @unique` — Cross-system identifier
- `transactionInitiator` — Enum: WH or ERP
- `transactionStatus` — Enum: PENDING, SENT, CONFIRMED
- `transactionType` — Enum: CREATE, UPDATE, DELETE
- `schemaVersion` — Message schema version
- `createdAt`, `updatedAt` — Timestamps
- `createdBy`, `updatedBy` — User attribution (optional)

---

## 7. Integration Patterns

### Pattern 1: RabbitMQ Event-Driven (Inbound)

```
External Service → RabbitMQ (fanout exchange) → ERPI Consumer → SyncService.upsert() → PostgreSQL
                                                                    ↓ (if NetSuite-bound)
                                                              NetSuiteOutbox.enqueue()
```

### Pattern 2: NetSuite Outbox (Outbound)

```
Outbox Entry (PENDING) → Cron (30s) → acquireEntries() → Lock (SELECT...FOR UPDATE SKIP LOCKED)
    → Handler.validate() → Handler.transform() → RESTlet Execute → markSucceeded()
    → Publish acknowledgment → channel.ack()

On failure: markFailed() → exponential backoff → retry (max 3 attempts) → dead-letter
```

### Pattern 3: ERP Polling (Inbound from NetSuite)

```
Cron Schedule → PollingEngine → NetSuite REST API (OAuth 1.0) → ErpSyncTransformService
    → Upsert to PostgreSQL → Publish to RabbitMQ (notify downstream)

Entities polled: vendor, item, customer, purchaseorder, salesorder, itemgroup, bom, asset, recipe, itemreceipt
```

### Pattern 4: Contract-First Type Safety

```
asyncapi.yaml (submodule) → TypeScript code generation → ERPIPayloadForTopic<T>
    → Compile-time validation of all message producers and consumers
```

---

## 8. API Surface

### REST API (`/api`)

Auto-generated CRUD for all 30+ entities via Amplication. Key custom endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | JWT authentication |
| `/api/health` | GET | Health check |
| `/api/erp-sync/resync/:entity` | POST | Manual re-sync trigger |
| `/api/erp-sync/resync-all` | POST | Re-sync all entities |
| `/swagger` | GET | OpenAPI documentation |

### GraphQL API

- Full CRUD operations for all entities
- Nested field queries and relations
- Auto-generated schema (124KB)
- Introspection and playground configurable via env vars

---

## 9. Auth Pattern

| Layer | Mechanism |
|-------|-----------|
| API Auth | JWT (passport-jwt), configurable expiration |
| ERP Auth | NetSuite OAuth 1.0 (HMAC-SHA256) |
| RBAC | JSON roles on User model + `grants.json` (ABAC) |
| Secrets | AWS Secrets Manager integration for key rotation |

---

## 10. Cross-Module Data Flows

### MES ↔ ERPI (Critical Path)

ERPI is the bridge between MES and NetSuite ERP. The MES recipe and production scheduling functionality depends on data flowing through ERPI:

**NetSuite → ERPI → MES (master data):**
- `recipe`, `recipeparameter`, `recipegroup` — Recipe definitions from ERP
- `bom`, `bomitem` — Bill of materials
- `item`, `itemgroup` — Item master data
- `vendor`, `customer` — Business entities

**MES → ERPI → NetSuite (transactional data):**
- `productionorderunitprocedure` — Production order execution (special handler: posts directly to NetSuite)
- `unitprocedure`, `operation`, `equipmentphase` — ISA-88 manufacturing execution data
- `productionschedule`, `scheduleorder`, `schedulequeue` — Production scheduling
- `itemreceipt` — Material receipts (delayed posting: 1-week threshold)

**Direction indicator:** The `transactionInitiator` field (`"WH"` vs `"ERP"`) on every entity payload tells which system originated the data. This is a native context field the Forge adapter must preserve.

### WMS ↔ ERPI

- `barrel`, `barrelevent`, `barrelreceipt` — Barrel inventory lifecycle
- `lot`, `kit` — Lot management
- `inventory`, `inventorytransfer` — Stock movements
- `location` — Warehouse locations

---

## 11. Forge Adapter Strategy

### Phase 1: Passive RabbitMQ Consumer (recommended first step)

The Forge ERPI adapter can subscribe to all 33 entity topic exchanges by creating its own durable queue per exchange. Because the exchanges are fanout, this requires **zero changes to whk-erpi**.

**What the adapter does:**
1. Connect to RabbitMQ
2. For each of the 33 entity exchanges, assert a new queue (e.g., `forge-erpi-<topic>`)
3. Bind each queue to the corresponding fanout exchange
4. Consume messages and map payloads to `ContextualRecord` using the AsyncAPI type definitions
5. Forward ContextualRecords to Forge hub via gRPC

**Context fields to extract:**
- `transactionInitiator` → maps to `context.source_system`
- `transactionStatus` → maps to `context.sync_state`
- `transactionType` → maps to `context.operation_type`
- `globalId` → maps to `context.cross_system_id`
- `recordName` → maps to `context.entity_type`
- `event_type` → maps to `context.event_type`
- `schemaVersion` → maps to `context.schema_version`

### Phase 2: GraphQL/REST API polling (enrichment)

For entities not published to RabbitMQ (or for initial data load), the adapter can poll the REST/GraphQL API to backfill historical data.

### Phase 3: Acknowledgment integration

The adapter can publish to `message_acknowledgment` to participate in ERPI's acknowledgment protocol, confirming receipt and processing of messages.

---

## 11. Key Observations for FACTS Spec

1. **AsyncAPI contract is already spec-first** — ERPI's asyncapi.yaml is functionally equivalent to a FACTS data contract. The FACTS spec should reference it, not duplicate it.
2. **Fanout exchanges are ideal for passive consumption** — no changes needed to ERPI.
3. **40 Prisma models** map cleanly to ContextualRecord entity families.
4. **Transaction tracking fields** (`transactionInitiator`, `transactionStatus`, `transactionType`) are native context fields — the adapter doesn't need to infer them.
5. **The outbox pattern should be preserved** — Forge should observe outbox state for data quality monitoring, not replace it.
6. **NetSuite OAuth 1.0 is ERPI's concern** — the Forge adapter never talks to NetSuite directly.
7. **16 actively consumed topics** in connectMicroservices.ts represent the live data flow; the remaining 17 topics are defined but less active.

---

*This document is referenced from SPOKE_ONBOARDING.md P1 (ERP Connector). Next step: FACTS spec.*
