# Manufacturing Entity Catalog

**Version:** 1.0
**Created:** 2026-04-06
**Path:** Roadmap Path 2 — Core Data Models
**Source Systems:** WHK-WMS (121 Prisma models), WHK-MES (84 Prisma models)

---

## Purpose

This document catalogs the shared manufacturing concepts extracted from the WHK WMS and MES Prisma schemas. It serves as the design rationale for the `forge.core.models.manufacturing` package — every model in that package traces back to entries in this catalog.

## Entity Family Cross-Reference

| # | Forge Core Model | WMS Source(s) | MES Source(s) | Shared Fields | Design Notes |
|---|---|---|---|---|---|
| 1 | `ManufacturingUnit` | Barrel (serialNumber, lotId, locationId, disposition) | Batch (status, assetId, lotId, planningData) | status lifecycle, lot reference, location reference, quantity | WMS tracks individual barrels by serial; MES tracks batches by index. ManufacturingUnit abstracts both via `unit_type` discriminator. |
| 2 | `Lot` | Lot (lotNumber, recipeId, productionOrderId, bblTotal, totalPGs) | Lot (globalId, whiskeyType, quantity, recipeId) | lot_number, recipe reference, status, quantity, product type | Both systems have nearly identical Lot concepts. MES has 52 fields (more complex hierarchy). Core model captures the common envelope. |
| 3 | `PhysicalAsset` | StorageLocation (warehouse/floor/rick/position/tier) + Warehouse + HoldingLocation | Asset (assetType, parentId, operationalState — ISA-95 hierarchy) | hierarchical parent, name/id, type classification | WMS uses coordinate system (5-tuple); MES uses ISA-95 tree. PhysicalAsset normalizes both via `asset_type` enum and `location_path`. |
| 4 | `OperationalEvent` | BarrelEvent (eventTypeId, eventTime, createdBy, result) + EventType + EventReason | ProductionEvent (eventType, severity, phase, category) + EquipmentStateTransition | timestamp, entity reference, operator, type classification | Both are immutable event logs. WMS has event/reason hierarchy; MES has severity/phase/category. Core carries `event_type` + `event_subtype` + `category` + `severity`. |
| 5 | `BusinessEntity` | Customer (globalId, data JSON, parentCustomerId) + Vendor (globalId, data JSON) | Customer (globalId, name, contactInfo) + Vendor (globalId, erpId, name) | name, external IDs, parent hierarchy, type (customer/vendor) | WMS stores as JSON blobs; MES has structured fields. Core uses typed fields + `external_ids` dict + `metadata` for overflow. |
| 6 | `ProcessDefinition` | Recipe (globalId, data JSON) | Recipe (9 related models: Operations, Parameters, BOMs, MashingProtocol) | name, version, product type | Biggest complexity gap. WMS Recipe is a simple JSON document. MES has ISA-88 procedural hierarchy. Core uses flat definition + optional `steps` list + `parameters` dict. |
| 7 | `WorkOrder` | WarehouseJobs (jobType, status, priority, parentJobId, templateId) + JobTemplate + JobDependency | ScheduleOrder (status, expectedStart/End, priority) + ScheduleOrderQueue | status, priority, type, scheduling times | WMS has rich decomposition (parent/child, templates). MES uses queue-based scheduling. Core captures the common shape with optional hierarchy. |
| 8 | `MaterialItem` | Item (erpId, itemName, itemNumber, itemClass) + BarrelOemCode | Item (globalId, erpId, name) + BomItem + Unit | item number, name, category, ERP ID | Both have Item models with ERP integration. Core adds `external_ids` for cross-system reconciliation. |
| 9 | `QualitySample` | Sample (sampleTypeId, barrelId, sampleResult, sampleValue) + SampleType (limits, units) | TestParameter (name, limits) + BatchParameterValue (value, timestamp) | entity reference, measured value, limits, pass/fail | Different structures but same concept: measure → compare → decide. Core uses `QualitySample` container with `SampleResult` items. |
| 10 | `ProductionOrder` | ProductionOrder (globalId, data JSON, barrelingStatus) + BarrelingQueue | ProductionOrder (status, expectedQuantity) + ScheduleOrder (timeline) | order number, recipe reference, status, quantities, schedule | Both authorize manufacturing. WMS focuses on barrel filling; MES on distillery operations. Core captures lifecycle from draft through completion. |

## Context Field Registry

12 canonical context fields registered, with WMS and MES provenance:

| Field | Type | Description | WMS Provenance | MES Provenance |
|---|---|---|---|---|
| `lot_id` | str | Material lot reference | Lot.id / BarrelEvent→Barrel.lotId | Lot.id / Batch.lotId |
| `shift_id` | str | Work shift identifier | EmployeeSchedule (derived) | OperatorShift.shiftName |
| `operator_id` | str | User performing operation | BarrelEvent.createdBy / User.username | StepExecution.operatorId |
| `event_timestamp` | datetime | Event occurrence time | BarrelEvent.eventTime | ProductionEvent.timestamp |
| `event_type` | str | Event classification | EventType.name | ProductionEvent.eventType |
| `work_order_id` | str | Associated work order | WarehouseJobs.id | ScheduleOrder.id |
| `equipment_id` | str | Physical asset/equipment | StorageLocation.globalId | Asset.id |
| `batch_id` | str | Production batch reference | (derived from Lot/PO) | Batch.id |
| `recipe_id` | str | Recipe/process definition | Recipe.globalId | Recipe.id |
| `operating_mode` | str | Equipment operating mode | (not directly available) | Asset.operationalState |
| `area` | str | Facility area/zone | StorageLocation.warehouse+floor | Asset hierarchy (area) |
| `site` | str | Manufacturing site | Warehouse.name | Asset hierarchy (site) |

## Concepts Deferred to Adapter Layer

These WMS/MES-specific concepts are NOT modeled in Forge core. They remain in the source system's domain and are captured via the `metadata` dict on core models:

- **WMS-specific:** BarrelOwnership, OwnershipTransaction, BarrelDelegation, HoldingLocation/PickArea coordinates, InventoryUpload/Check workflows, AndroidSync, Printer automation, CustomerLogo/Insurance
- **MES-specific:** MashingProtocol (deep step hierarchy), FormulaLibrary, EnzymeConfiguration, MQTT/UNS configuration, FermenterAssignment, ChangeoverAreaState, BatchDeviation (complex severity/phase classification)
- **Both but adapter-specific:** User/Auth models, AuditLog formats (different schemas), Comment threading, Reporting/Dashboard configuration

## Design Principles Applied

1. **Provenance-first:** Every instance carries `source_system` + `source_id` for traceability
2. **Immutable core, mutable metadata:** Typed core fields for validation; `metadata: dict` for system-specific overflow
3. **ID agnostic:** `forge_id` (UUID) is Forge's own; `source_id` is the origin system's PK
4. **Enum-driven lifecycle:** Status fields use Forge-canonical enums; adapters map
5. **Flat references:** `lot_id: str` not embedded `lot: Lot` — the graph lives in Neo4j
6. **Industry-general naming:** ManufacturingUnit not Barrel; ISA-95/ISA-88 where applicable
