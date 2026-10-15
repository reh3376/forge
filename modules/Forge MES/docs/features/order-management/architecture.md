# Order Management Technical Architecture

## Overview

The Order Management system implements a two-tier order hierarchy designed for whiskey production. Production Orders (PrOs) represent individual customer commitments with strict one-of constraints, while Schedule Orders (SchOs) group compatible PrOs for shared execution through combined mashing, fermentation, and distillation.

## Design Principles

### Production Order: The Atomic Unit

A Production Order is the most granular production commitment. MES Phase 1 enforces **one-of constraints** — each PrO specifies exactly one value for each critical dimension:

| Constraint | Description | Enforcement |
|---|---|---|
| One Customer | Single customer per order | Required FK, validated at creation |
| One Mash Bill | Single grain recipe formulation | Via recipe and recipe group linkage |
| One Container Type | Single barrel/container designation | Required enum field |
| One Proof | Single target proof specification | Required `finalProof` field |
| One BOM | Single Bill of Materials | Required FK to `Bom` |
| One FG Item Code | Unique finished goods identifier | Auto-generated, required FK |

These constraints exist because each PrO ultimately becomes a distinct finished good with its own item number, lot tracking, and ERP identity in NetSuite.

### Schedule Order: The Execution Unit

A Schedule Order groups one or more PrOs that share the same mash bill (recipe group) for combined production execution. The key insight: whiskey production is batch-oriented — grain is mashed and fermented together regardless of how many customers will receive the final product.

**The grouping rule is strict**: all PrOs in a SchO must belong to the same recipe group (mash bill). Different container types, proofs, and customers generate warnings but are allowed because the separation point happens after distillation.

### Order Hierarchy

```
Customer Order (external)
  └── Production Order (PrO) ─── atomic production commitment
        ├── One Customer
        ├── One Recipe (mash bill)
        ├── One Container Type
        ├── One Final Proof
        ├── One BOM
        └── One FG Item Code

Schedule Order (SchO) ─── execution grouping
  ├── PrO #1 (Customer A, LargeBarrel, 120 proof)
  ├── PrO #2 (Customer B, SmallBarrel, 100 proof)
  └── PrO #3 (Customer A, LargeBarrel, 125 proof)
        ↓
  All share same mash bill → combined mashing/fermentation
        ↓
  Separation after distillation → individual PO tracking
```

## Recipe BOM Integration

### Master to Instance Chain

The recipe system uses a three-level hierarchy that mirrors the order hierarchy:

```
Master Recipe (template)
  └── ScheduleOrderRecipeInstance (SO-level running copy)
        ├── RecipeBom copies (running, master: false)
        ├── RecipeParameter copies (running, master: false)
        ├── MashingProtocol copy (running, master: false)
        └── RecipeBomActual records (consumption tracking)
              ↓ (after separation)
        ProductionOrderRecipeInstance (PO-level)
              ├── Inherits from SORI
              └── Individual tracking per PO
```

**Creation flow:**

1. **Master Recipe** exists as a template with `master: true, running: true`
2. When a SchO becomes active (queue position 0), a **ScheduleOrderRecipeInstance** is created
3. All recipe components (BOM, parameters, mashing protocol) are copied — not referenced — to the SO level
4. BOM quantities are calculated based on grain/water loads using configurable formulas
5. During production, actuals are recorded against the SO-level instance
6. At separation, **ProductionOrderRecipeInstances** are created for individual PO tracking

### BOM Calculation Modes

Recipe BOM items support multiple calculation modes for dynamic quantity determination:

| Mode | Description | Example |
|---|---|---|
| `STATIC` | Fixed quantity from template | 100 lbs backset |
| `FORMULA_GRAIN` | Quantity based on grain load | grainLoad x 0.7 |
| `FORMULA_WATER` | Quantity based on water load | waterLoad x 0.25 |
| `ENZYME_NORMALIZED` | Enzyme dosing by grain and mash bill | Normalized per bushel |
| `EXPRESSION` | Custom formula engine | Complex multi-variable |

Formula types within grain/water modes:
- `SIMPLE_RATIO` — direct multiplication
- `WATER_PER_BUSHEL` — `(grainLoad / 56) x multiplier`
- `BACKSET_PERCENTAGE` — `waterLoad x multiplier`

## Validation Architecture

### Production Order Validation (MES Phase 1)

Validation occurs in the `ProductionOrderService` via `validateMESPhase1Constraints()`. All constraints throw `BadRequestException` with descriptive messages:

```
Container type is required for MES Phase 1 compliance.
Final proof is required and must be greater than 0.
Customer is required for MES Phase 1 compliance.
BOM is required for MES Phase 1 compliance.
Item is required for MES Phase 1 compliance.
MES Phase 1 constraint violation: Production Order cannot have multiple container items.
```

Container item compatibility is validated via `ContainerItemService.validateContainerItemCompatibility()`.

### Schedule Order Grouping Validation

The `ScheduleOrderGroupingService.validateProductionOrderGrouping()` performs multi-level validation:

**Hard failures (block creation):**
- Different recipe groups (mash bills) across PrOs
- PrO already scheduled (`scheduleOrderId` not null or `scheduled: true`)
- PrO not found in database

**Warnings (logged but allowed):**
- Different container types across PrOs
- Different final proofs across PrOs
- Different customers across PrOs

### Cancellation Guards

Production Orders can only be cancelled from `Planned` or `Initiated` status. Orders linked to a Schedule Order must be removed from the schedule first.

## Transaction Architecture

### Wizard Creation (Three-Phase)

The Production Order wizard uses a three-phase approach to balance atomicity with fault tolerance:

**Phase 1 — Read-Only Validation** (no transaction):
- Validate recipe, customer, units exist
- Generate item number
- Prepare bin configuration metadata

**Phase 2 — Atomic Write** (single transaction, 30s timeout):
- Create/find item record
- Create BOM and BOM items
- Get/create recipe group
- Create production order with all relationships

**Phase 3 — Auto-Schedule** (separate transaction, optional):
- Create Schedule Order via grouping service
- Create queue entry
- Non-blocking: PrO is created even if scheduling fails

### Schedule Order Creation (Atomic)

The `ScheduleOrderGroupingService.createScheduleOrderFromProductionOrders()` uses a 90-second transaction timeout:
- Creates ScheduleOrder
- Creates ScheduleOrderRecipeInstance (with all component copies)
- Links all PrOs
- Both succeed or both roll back

### Queue Reordering (Retry with Backoff)

Queue index updates use a swap-based algorithm with 3-retry exponential backoff:
- `ReadCommitted` isolation level
- Handles `P2034` (write conflict), `40001` (serialization), `40P01` (deadlock)
- Maximum 5-second backoff between retries

## Status State Machines

### Production Order Status

```
Initiated ──→ Committed ──→ InProgress ──→ Complete
    │              │
    └──→ Cancelled ←┘
         (only from Planned/Initiated)
```

Status cascading from Schedule Order:
- SchO `Scheduled` → PrO `Committed`
- SchO `InProgress` → PrO `InProgress`
- SchO `Complete` → PrO `Complete`

### Schedule Order Status

```
Created ──→ Scheduled ──→ InProgress ──→ ReadyForSeparation
                                              │
                                         Separating
                                              │
                                         Separated ──→ Complete
```

- `Created`: Initial state after grouping
- `Scheduled`: Added to queue
- `InProgress`: Active production (queue position 0)
- `ReadyForSeparation`: All cooks complete (`executedCooks >= totalCooks`)
- `Separating` → `Separated`: Individual PO tracking begins
- `Complete`: All POs fulfilled

## Queue Architecture

### Index-Based Ordering

The `ScheduleOrderQueue` uses integer indices for deterministic ordering:

| Index | Meaning |
|---|---|
| 0 | Currently active (running) |
| 1 | Next up (lookahead — recipe instance pre-created) |
| 2+ | Waiting in queue |
| Negative | Completed/archived |

**Key behaviors:**
- New entries append at `maxIndex + 1`
- Starting an order moves it to index 0, shifts others
- Completing the active order removes it, decrements all indices
- Reordering uses swap-based logic with conflict retry

### Lookahead Pattern

When a SchO reaches queue position 1, the system pre-creates its `ProductionOrderRecipeInstance`. This ensures recipe data is ready before the order becomes active, reducing startup time.

## Event Architecture

### RabbitMQ Events

Topic: `WhWhk01Distillery01Productionorder` / `WhWhk01Distillery01Scheduleorder`

Event types emitted:
- `create`, `update`, `delete`
- `deschedule`
- `cook_complete`, `recipe_loaded_to_plc`
- `queue_advanced`, `execution_update`

### MQTT Domain Publishing

The `MqttDomainPublisherService` publishes fire-and-forget events for:
- ProductionOrder: `create`, `update`, `wizard_complete`
- ScheduleOrder: `create`, `update`

Events are configuration-driven via `MqttEventPublishRule` with topic templates using `{variable}` placeholders.

## Planning Calculations

### Timeline Formulas

```
mashingDuration       = totalCooks x 2 hours
fermentationDuration  = 72 hours + mashingDuration
distillationDuration  = fermentationDuration
totalDuration         = fermentationDuration
```

Timeline offsets (from `estimatedStart`):
- Mashing starts: `estimatedStart`
- Fermentation starts: `estimatedStart + 2 hours` (overlaps with mashing)
- Fermentation ends: fermentation start + fermentation duration
- Distillation follows fermentation
- Barreling follows distillation

### Yield Estimation Integration

The `YieldEstimationService` calculates resource requirements:
- Proof Gallons per Barrel (PG/BBL)
- Proof Gallons per Fermenter (PG/Ferm)
- Barrels per Fermenter (BBL/Ferm)
- Total Fermenters needed
- Total Cooks needed
- Total Grain required

Default yields: Bourbon 5.2 PG/GU, other whiskey 4.9 PG/GU, average barrel fill 53.07 gallons.

Recipe-level overrides (`recipe.totalCooks`, `recipe.totalFermenters`) take precedence over calculated values.

### Planning Modes

Schedule Orders support two planning modes:
- **`auto`** (default): System calculates cooks, fermenters, grain, and timelines from yield estimation
- **`manual`**: Operator provides values directly; system uses them as-is

## Item Number Generation

Format: `{CUSTOMER_CODE}-{MASH_BILL}-{BARREL_INFO}-{FINAL_PROOF}-{REVISION}`

Example: `ACME-75-21-00-04-53-04-4-4-0-120-R01`

| Segment | Source | Example |
|---|---|---|
| Customer Code | Customer record | `ACME` |
| Mash Bill | Extracted from recipe name (4 groups of 2 digits) | `75-21-00-04` |
| Barrel Info | Large/Small barrel: `53-04-4-4-0`; other: `00-00-0-0-0` | `53-04-4-4-0` |
| Final Proof | From PrO specification | `120` |
| Revision | Always starts at `R01` | `R01` |

Mash bill extraction uses regex patterns on recipe names (e.g., `DWL-75-21-00-04-R01`). Default fallback: `70-20-08-02`.

## Item Classification

Items created by the wizard are classified for NetSuite integration:

| Container Type | Item Class | Item Group |
|---|---|---|
| LargeBarrel, SmallBarrel | Assembly | FG-BBL |
| BulkLoadout, PlasticDrum, IbcTote275, SsTote275 | Assembly | FG-DIS |

---

*See also: [Order Relationships](./order-relationships.md) | [Production Order User Guide](./user-guide-production-orders.md) | [Schedule Order User Guide](./user-guide-schedule-orders.md)*
