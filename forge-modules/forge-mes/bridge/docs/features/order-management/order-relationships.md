# Order Relationship Management

## Overview

The MES Order Management system uses a hierarchical model where orders, recipes, and queue entries maintain strict parent-child relationships. Understanding these relationships is essential for troubleshooting, planning, and day-to-day operations.

## Order Hierarchy

```
Customer
  └── Production Order (PrO)
        ├── Item (FG code)
        ├── BOM (Bill of Materials)
        ├── Recipe (master link)
        └── Schedule Order (SchO) ─── optional, set when grouped
              ├── Recipe Group (mash bill grouping)
              ├── Customers[] (M:N — all unique customers from PrOs)
              ├── ScheduleOrderRecipeInstance (running recipe copy)
              │     ├── RecipeBom copies
              │     ├── RecipeParameter copies
              │     ├── MashingProtocol copy
              │     ├── RecipeBomActual[] (consumption tracking)
              │     └── RecipeParameterActual[] (parameter tracking)
              └── ScheduleOrderQueue (queue position)
                    └── Areas[] (assigned production areas)
```

## Parent-Child Relationships

### Schedule Order to Production Orders (1:N)

A Schedule Order groups one or more Production Orders for combined execution. The relationship is established when PrOs are grouped:

- **Link**: `ProductionOrder.scheduleOrderId` → `ScheduleOrder.id`
- **Flags**: PrO's `scheduled` field is set to `true`
- **Constraint**: All PrOs must share the same recipe group (mash bill)
- **Allocation**: The SchO stores `productionOrderAllocation` JSON capturing each PrO's id, name, customer, container type, proof, and quantity

**Unlinking (descheduling):**
When a SchO is descheduled, all linked PrOs are reset:
- `scheduleOrderId` → `null`
- `scheduled` → `false`
- `status` → `Initiated`

### Schedule Order to Customers (M:N)

A Schedule Order connects to multiple customers because it may group PrOs from different customers:

- **Link**: Direct M:N relation (`ScheduleOrder.customers`)
- **Source**: Extracted from unique `customerId` values across all grouped PrOs
- **Purpose**: Enables filtering/reporting by customer at the schedule level

### Schedule Order to Queue (1:1)

Each Schedule Order has at most one queue entry:

- **Link**: `ScheduleOrder.scheduleOrderQueueId` → `ScheduleOrderQueue.id` (unique)
- **Queue entry**: Holds `queueIndex` (position) and linked `areas`

### Production Order to Recipe (N:1)

Multiple PrOs can reference the same master recipe:

- **Link**: `ProductionOrder.recipeId` → `Recipe.id`
- **Purpose**: Tracks which mash bill formulation applies

### Production Order to Item (N:1)

The FG item represents the finished good in NetSuite:

- **Link**: `ProductionOrder.fgItemId` → `Item.id`
- **Auto-generated**: Item created or found during wizard based on customer code, mash bill, container type, and proof

### Production Order to BOM (1:1)

Each PrO has its own production BOM:

- **Link**: `ProductionOrder.bomId` → `Bom.id`
- **Created during wizard**: Contains BOM items from the wizard payload

## Recipe Instance Hierarchy

The recipe instance system uses a copy-on-activate pattern to enable independent modification during production while preserving the master template.

### Level 1: Master Recipe

The master recipe is the template. It contains:
- Master RecipeBom with `master: true, running: true`
- Master RecipeParameters with `isClassDefinition: true`
- Master MashingProtocol with `isTemplate: true`
- RecipeGrainCharacters (grain percentages for mash bill)

Master recipes support revision tracking: `baseRecipeName` + `revision` (e.g., `DWL-75C-21R-4M-R02`).

### Level 2: ScheduleOrderRecipeInstance (SORI)

Created when a Schedule Order becomes active (queue position 0). The SORI is the central hub for combined production execution.

**What gets copied:**
- All RecipeBom records → new records with `master: false, running: true`
- All RecipeBomItems → new records with formula configuration preserved
- All RecipeParameters → new records with `master: false, running: true` (deduplicated by name)
- MashingProtocol → new record with `isTemplate: false`
- MashingProtocolSteps → new records linked to SO-level BomItems

**What gets tracked at SORI level:**
- `RecipeBomActual` — material consumption with lot traceability
- `RecipeParameterActual` — process parameter values (temperature, pH, etc.)
- `Batch` records — S88 batch execution
- `status` and `currentPhase` progression

**Phase progression:**
```
Created → Active → InSeparation → Completed
                                    (or Cancelled)
```

**Production phases:**
```
Mashing → Fermentation → Distillation → Barreling
```

### Level 3: ProductionOrderRecipeInstance (PORI)

Created either:
1. **At queue position 1** (lookahead): Pre-created for the next order in queue
2. **At separation**: When combined execution splits into individual PO tracking

After separation, each PORI inherits from the SORI and enables:
- Individual PO-level BOM actual tracking
- Per-customer lot assignment
- Independent status progression

**Key fields:**
- `createdFromSeparation: true` — marks PORI as post-separation instance
- `separatedAt` — timestamp of separation
- `scheduleOrderRecipeInstanceId` — back-link to parent SORI

## BOM Propagation: Master to Running to Actual

### Flow

```
Master RecipeBom (template)
  └── RecipeBomItem (with calculation config)
        │
        ↓  (copy on SORI creation)
        │
SO-Level RecipeBom (running copy)
  └── RecipeBomItem (with same calculation config)
        │
        ↓  (calculate quantities from loads)
        │
RecipeBomActual (planned + actual quantities)
  ├── quantityPlanned (calculated from formula)
  ├── quantityActual (recorded during production)
  ├── lotNumber (traceability)
  ├── inventoryId (inventory link)
  └── formulaUsed (audit trail)
```

### Recalculation on Load Changes

When grain or water loads change (`ScheduleOrderService.updateLoads()`), the system:

1. Finds the active SORI for the SchO
2. Calls `BomCalculationService.recalculateOnLoadChange()`
3. For each BOM item:
   - If no consumption recorded (`quantityActual = 0`): update `quantityPlanned` directly
   - If consumption exists: create a new revision record preserving the old one
4. Updates `lastCalculatedAt` on all recalculated items

## Status Dependencies and Cascading

### Schedule Order → Production Order Status Cascade

When a Schedule Order status changes, linked Production Orders are updated automatically:

| SchO Status | PrO Status | Trigger |
|---|---|---|
| `Scheduled` | `Committed` | SchO added to queue |
| `InProgress` | `InProgress` | SchO becomes active (position 0) |
| `Complete` | `Complete` | SchO marked complete |

### Schedule Order → Production Order Timeline Cascade

When scheduling fields change on a SchO, linked PrOs are updated:
- `ScheduleOrder.estimatedStart` → `ProductionOrder.startDate`
- `ScheduleOrder.estimatedEnd` → `ProductionOrder.endDate`

Monitored fields: `estimatedStart`, `estimatedEnd`, `estimatedMashingStartTime`, `estimatedFermentationStartTime`, `estimatedDistillationStartTime`, `status`.

### Cook Completion → Status Transition

When `executedCooks >= totalCooks` on a SchO, the status automatically transitions to `ReadyForSeparation`. This is tracked in the `recordCookComplete()` method.

## Mash Bill Consistency Rules

### The Core Rule

All Production Orders in a Schedule Order must belong to the same **recipe group** (mash bill). This is a hard constraint validated by `ScheduleOrderGroupingService.validateProductionOrderGrouping()`.

### What is a Recipe Group?

A Recipe Group represents a distinct mash bill formulation. Recipes are assigned to groups based on their grain composition:
- `DWL-75-21-00-04-R01` → recipe group for 75% corn, 21% rye, 0% wheat, 4% malt
- `DWL-70-20-08-02-R01` → different recipe group

### Auto-Creation

During PrO wizard creation, if no recipe group exists for the extracted mash bill, one is auto-created and the recipe is linked to it.

### What Can Differ Within a Group

PrOs in the same SchO can have different:
- Customers (SchO tracks all via M:N)
- Container types (LargeBarrel, SmallBarrel, etc.)
- Final proofs (120, 125, etc.)
- Quantities

These differences generate warnings at grouping time but are allowed because the separation point occurs after combined execution.

## The Separation Point

Separation is the transition from combined SchO-level execution to individual PO-level tracking:

```
Combined Execution (SchO level)          Individual Tracking (PO level)
─────────────────────────────────────    ──────────────────────────────
Mashing ──→ Fermentation ──→ Distillation    │──→ Barreling (PO #1)
                                              │──→ Barreling (PO #2)
                                              └──→ Barreling (PO #3)
```

**What happens at separation:**
1. SORI status transitions to `InSeparation`
2. PORIs are created for each linked PrO (with `createdFromSeparation: true`)
3. BOM actuals can be re-linked to PO-level instances
4. Each PO continues independently with its own container type, proof, and customer

## Troubleshooting Relationships

### PrO Not Appearing in SchO

**Check:**
- `ProductionOrder.scheduleOrderId` — should match the SchO ID
- `ProductionOrder.scheduled` — should be `true`
- Recipe group — PrO's recipe must be in the same recipe group as other PrOs in the SchO

### SchO Missing Recipe Instance

**Check:**
- Queue position — SORI is only created when SchO reaches position 0 (active)
- `ScheduleOrder.totalGrainWeight` — must be > 0 for instance creation
- `ScheduleOrderRecipeInstance` record exists and links to SchO

### BOM Quantities Not Updating

**Check:**
- `RecipeBomItem.calculationMode` — `STATIC` items don't recalculate
- Load values — `totalGrainWeight` and `totalWaterVolume` must be set on the SchO
- Existing consumption — items with `quantityActual > 0` create revisions instead of updating

### Descheduling Fails

**Check:**
- Queue index — cannot deschedule the active order (index 0)
- The SchO must have a queue entry to deschedule

### Status Not Cascading

**Check:**
- The PrO must have `scheduleOrderId` set (linked to the SchO)
- Only specific SchO status changes trigger cascading (Scheduled, InProgress, Complete)
- Look for errors in the ScheduleOrder update handler that processes cascading

---

*See also: [Architecture](./architecture.md) | [Production Order User Guide](./user-guide-production-orders.md) | [Schedule Order User Guide](./user-guide-schedule-orders.md) | [Troubleshooting](./troubleshooting.md)*
