# Schedule Order User Guide

## What is a Schedule Order?

A Schedule Order (SchO) groups one or more Production Orders that share the same mash bill for combined production execution. While each PrO represents a customer-specific commitment, the SchO represents how whiskey is actually produced: grain is mashed and fermented together in batches, regardless of the final customer destination.

Think of a SchO as the production plan: "We will cook, ferment, and distill this batch of 75/21/0/4 bourbon, then separate it into individual customer orders for barreling."

## Key Concepts

### Grouping Rules

The fundamental rule: **all Production Orders in a Schedule Order must have the same mash bill** (recipe group). This is a hard constraint — the system will reject incompatible groupings.

**Allowed differences within a group:**
- Different customers (tracked via M:N relationship)
- Different container types (LargeBarrel, SmallBarrel, etc.)
- Different final proofs (120, 125, etc.)
- Different quantities

These differences generate warnings but are permitted because separation happens after distillation.

### The Combined Execution Model

```
PrO #1 (Customer A, 200 BBL, 120 proof) ─┐
PrO #2 (Customer B, 150 BBL, 125 proof) ─┼──→ Schedule Order ──→ Combined Mashing
PrO #3 (Customer A, 100 BBL, 100 proof) ─┘         │              Combined Fermentation
                                                     │              Combined Distillation
                                                     │                    │
                                                     │              Separation Point
                                                     │                    │
                                                     ├──→ PrO #1 barreling (120 proof, large barrels)
                                                     ├──→ PrO #2 barreling (125 proof, large barrels)
                                                     └──→ PrO #3 barreling (100 proof, small barrels)
```

## Creating a Schedule Order

### Method 1: From Production Order Grouping

The primary way to create a SchO is by grouping existing PrOs:

1. Select one or more PrOs with the same mash bill
2. The system validates compatibility (same recipe group)
3. A SchO is created with:
   - Auto-generated name: `SchO-{recipeName}-{date}-{randomHex}`
   - All PrOs linked and marked as scheduled
   - Customer list extracted from all PrOs
   - Production allocation JSON capturing each PrO's details

### Method 2: Auto-Schedule from PrO Wizard

When creating a PrO with `autoSchedule: true`, the system automatically:
1. Creates the PrO
2. Creates a SchO via the grouping service
3. Adds the SchO to the queue

### Method 3: Find Compatible Orders

Use `findCompatibleProductionOrders()` to discover PrOs that can be added to an existing group:
- Finds unscheduled PrOs with the same recipe group
- Returns up to 10 compatible orders, sorted by creation date

## Recipe BOM Integration

### What Happens When a SchO Becomes Active

When a SchO reaches queue position 0 (active), the system creates a **ScheduleOrderRecipeInstance** (SORI):

1. **RecipeBom copies** — all master BOM records are copied with formula configuration
2. **RecipeParameter copies** — all parameters copied and deduplicated by name
3. **MashingProtocol copy** — full protocol with steps linked to SO-level BOM items
4. **Initial BOM calculations** — quantities calculated from grain and water loads

The SORI is the working copy of the recipe for this production run. Changes to the SORI do not affect the master recipe.

### Managing Mashing Additives and Yeast

Mashing additives and yeast specifications are part of the RecipeBom:
- Each BOM item has an **operation** (Mashing01, Fermentation01, Distillation01, Processing01)
- Quantities are calculated based on the BOM item's calculation mode
- Additives can use `FORMULA_GRAIN` mode for automatic scaling with grain load
- Yeast quantities typically use `STATIC` mode or `ENZYME_NORMALIZED`

### BOM Recalculation

When loads change (grain weight or water volume updated on the SchO), BOM quantities are automatically recalculated:
- Items with no consumption recorded: `quantityPlanned` updated in place
- Items with existing consumption: new revision created preserving the original

## Timeline Management

### Phase Durations

The system calculates production timelines using these formulas:

| Phase | Duration Formula |
|---|---|
| Mashing | `totalCooks x 2 hours` |
| Fermentation | `72 hours + mashingDuration` |
| Distillation | Same as fermentation duration |
| Total Production | Same as fermentation duration |

### Timeline Offsets

Starting from `estimatedStart`:

```
Time ──────────────────────────────────────────────────→

Mashing:       |████████████|
               ↑ estimatedStart
                    ↑ +2 hours
Fermentation:       |██████████████████████████████|
                                                   ↑ fermentation end
Distillation:                                      |██████████████████████████████|
                                                                                  ↑ distillation end
Barreling:                                                                        |████|
```

Key: fermentation starts 2 hours after mashing begins (overlapping phases).

### Example Timeline

For a SchO with 6 cooks:
- Mashing: 6 x 2 = 12 hours
- Fermentation: 72 + 12 = 84 hours (3.5 days)
- Distillation: 84 hours
- Total: ~84 hours from fermentation start

## Production Planning

### Resource Calculation

The yield estimation system calculates resource needs:

| Resource | How Calculated |
|---|---|
| Total Barrels | Sum of PrO quantities |
| Proof Gallons | From yield estimation (PG/BBL x barrels) |
| Fermenters | From yield estimation (barrels / BBL per fermenter) |
| Cooks | From yield estimation or recipe (totalCooks override) |
| Grain | From yield estimation or `grainPerCook x totalCooks` |

### Planning Modes

**Auto mode** (default):
- System calculates cooks, fermenters, grain, and timelines
- Uses yield estimation based on whiskey type and barrel count
- Recipe overrides (`recipe.totalCooks`, `recipe.totalFermenters`) take precedence over calculated values

**Manual mode**:
- Operator provides values directly
- System uses provided values without recalculating
- Useful for non-standard production runs

### Yield Estimation Defaults

| Parameter | Bourbon Default | Other Whiskey |
|---|---|---|
| Proof Gallons per GU | 5.2 | 4.9 |
| Average Barrel Fill | 53.07 gallons | 53.07 gallons |
| PGs per BBL (fallback) | 66.34 | 66.34 |
| BBL per Fermenter (fallback) | 100 | 100 |

## Multi-Customer Allocation

When a SchO groups PrOs from multiple customers:

- All unique customers are linked via M:N relationship
- The `productionOrderAllocation` JSON records each PrO's details:
  ```json
  [
    { "id": "po-1", "name": "PO-001", "customerId": "c1", "customerName": "Acme", "containerType": "LargeBarrel", "finalProof": 120, "quantity": 200 },
    { "id": "po-2", "name": "PO-002", "customerId": "c2", "customerName": "BevCo", "containerType": "SmallBarrel", "finalProof": 125, "quantity": 150 }
  ]
  ```
- After separation, each customer's PrO is tracked independently

## Queue Management

### How the Queue Works

The Schedule Order Queue uses integer indices for deterministic ordering:

| Position | Meaning | What Happens |
|---|---|---|
| **0** | Active — currently in production | Recipe instance active, execution tracked |
| **1** | Next up — recipe instance pre-created | Lookahead: PORI created for preparation |
| **2+** | Waiting | In queue, ordered by index |

### Adding to the Queue

New SchOs are added at the end of the queue (`maxIndex + 1`). An area assignment (e.g., Granary) is automatically linked if available.

### Reordering the Queue

Orders can be reordered by changing their queue index:
- Cannot move to index 0 (only via activation)
- Cannot skip beyond `maxIndex + 1`
- Reordering uses a swap-based algorithm with retry logic for concurrent access

### Starting an Order

To start the next order (move from position 1 to active):
1. The current active order (position 0) must be completed or advanced
2. The next order moves to position 0
3. All remaining orders shift up by one position
4. A recipe instance is created for the newly active order

### Advancing the Queue

`advanceScheduleOrderQueue()` completes the current active order and activates the next:
1. Current order (position 0) is marked Complete and removed
2. All remaining indices are decremented (2→1, 3→2, etc.)
3. The new position-0 order becomes active

### Descheduling

Removing an order from the queue:
- Cannot deschedule the active order (position 0)
- PrOs are unlinked and reset to `Initiated` status
- Queue indices are resequenced to fill the gap
- The SORI is deleted (cascades related data)

## Execution Tracking

### Cook Tracking

As cooks complete, record them via `recordCookComplete()`:
- Increments `executedCooks` by 1
- Creates an audit log with cook details (index, cooker number, timestamp, notes)
- When `executedCooks >= totalCooks`, auto-transitions to `ReadyForSeparation`

### Fermenter Tracking

Track fermenter completion via `recordFermenterExecution()`:
- Increments `executedFermenters`
- Updates `completedFermenters` (takes max of old and new values)

### Progress Monitoring

`getProductionExecutionStatus()` returns:
- Cook progress: `(completedCooks / totalCooks) x 100`
- Fermenter progress: `(completedFermenters / totalFermenters) x 100`
- Overall progress: average of cook and fermenter progress

### Load Updates

Update grain and water loads via `updateLoads()`:
- Sets `totalGrainWeight` and `totalWaterVolume`
- Triggers BOM recalculation if a recipe instance exists
- Records who made the change and when

## Status Lifecycle

| Status | Meaning | Trigger |
|---|---|---|
| **Created** | SchO created, not queued | Default on creation |
| **Scheduled** | Added to production queue | Queue entry created |
| **InProgress** | Active production | Moved to queue position 0 |
| **ReadyForSeparation** | All cooks complete | `executedCooks >= totalCooks` |
| **Separating** | Separation in progress | Separation event started |
| **Separated** | PO-level tracking active | Separation complete |
| **Complete** | All production finished | All POs fulfilled |

```
Created → Scheduled → InProgress → ReadyForSeparation → Separating → Separated → Complete
```

## Common Operations

### Check if PrOs Can Be Grouped

Before grouping, validate compatibility:
1. Ensure all PrOs have recipes assigned
2. Ensure all PrOs belong to the same recipe group
3. Check no PrOs are already scheduled

### Update Production Estimates

After grouping or when plans change:
1. Update `totalGrainWeight` and `totalWaterVolume` on the SchO
2. Load updates trigger automatic BOM recalculation
3. Review updated BOM quantities in the recipe instance

### Record Recipe Loaded to PLC

After loading the recipe to the PLC controller:
1. Call `recordRecipeLoadedToPLC()` with the SchO ID
2. Creates an audit trail of the recipe load
3. Captures the SORI's `updatedAt` for change detection (detect if recipe was modified after PLC load)

---

*See also: [Architecture](./architecture.md) | [Production Order User Guide](./user-guide-production-orders.md) | [Order Relationships](./order-relationships.md) | [Quick Reference](./quick-reference.md)*
