# Order Management Quick Reference

## Production Order Constraint Checklist

Before creating a Production Order, verify:

- [ ] **Customer** selected (exactly one)
- [ ] **Recipe** selected (determines mash bill)
- [ ] **Container type** chosen (LargeBarrel, SmallBarrel, BulkLoadout, PlasticDrum, IbcTote275, SsTote275)
- [ ] **Final proof** specified (must be > 0)
- [ ] **BOM items** provided (at least one)
- [ ] **Units** valid (must exist in the system)
- [ ] **Quantity** specified (>= 1)
- [ ] **Start/End dates** provided

## Schedule Order Recipe BOM Checklist

Before activating a Schedule Order:

- [ ] All PrOs share the **same recipe group** (mash bill)
- [ ] **Total grain weight** set on the SchO (required for SORI creation)
- [ ] **Total water volume** set (for water-based BOM calculations)
- [ ] **Recipe** linked with valid mashing protocol
- [ ] **Planning estimates** reviewed (cooks, fermenters, grain per cook)
- [ ] **Timeline** calculated (auto or manual)

## Status Progression

### Production Order

```
Initiated → Committed → InProgress → Complete
    ↓            ↓
  Cancelled   Cancelled
```

| Status | Meaning | Can Cancel? |
|---|---|---|
| Initiated | Created, not scheduled | Yes |
| Planned | Planned for production | Yes |
| Committed | On the schedule (SchO is Scheduled) | No* |
| InProgress | Production active (SchO is InProgress) | No |
| Complete | Done (SchO is Complete) | No |
| Cancelled | Cancelled | N/A |

*Must remove from schedule first.

### Schedule Order

```
Created → Scheduled → InProgress → ReadyForSeparation → Separating → Separated → Complete
```

| Status | Meaning | Queue Position |
|---|---|---|
| Created | Just created | Not in queue |
| Scheduled | In queue | 1+ |
| InProgress | Active production | 0 |
| ReadyForSeparation | All cooks done | 0 |
| Separating | Splitting to POs | 0 |
| Separated | PO tracking active | 0 |
| Complete | All done | Removed |

## Validation Error Quick Fixes

| Error | Fix |
|---|---|
| "Container type is required" | Select a container type in the wizard |
| "Final proof is required and must be greater than 0" | Enter a proof value > 0 |
| "Customer is required" | Select a customer |
| "BOM is required" | Add at least one BOM item |
| "Item is required" | Check that units exist in the system |
| "Cannot have multiple container items (N provided)" | Remove extra container items, keep one |
| "Cannot cancel with status {status}" | Only Planned/Initiated orders can be cancelled |
| "Cannot cancel — linked to ScheduleOrder" | Deschedule the PrO first |
| "Queue index must be greater than 0" | Cannot move order to position 0 manually |
| "New index X is beyond valid range (max: Y)" | Choose index within valid range |
| "Cannot deactivate with index <= 1" | Only orders at position 2+ can be deactivated |
| "Cannot delete currently running order (index 0)" | Complete or advance the queue instead |
| "Different recipe groups" | All PrOs must share the same mash bill |

## Key Field Descriptions

### Production Order Fields

| Field | Type | Description |
|---|---|---|
| `name` | String (unique) | Order identifier |
| `status` | Enum | Current lifecycle status |
| `quantity` | Int | Number of containers to produce |
| `finalProof` | Float | Target alcohol proof |
| `containerType` | Enum | Container/barrel type |
| `scheduled` | Boolean | Whether linked to a SchO |
| `inProcess` | Boolean | Whether production has started |
| `complete` | Boolean | Whether production is done |
| `upperControlLimit` | Int | Quality upper threshold |
| `lowerControlLimit` | Int | Quality lower threshold |

### Schedule Order Fields

| Field | Type | Description |
|---|---|---|
| `name` | String (unique) | Auto-generated identifier |
| `status` | Enum | Current lifecycle status |
| `recipeName` | String | Name of the linked recipe |
| `planningMode` | String | "auto" or "manual" |
| `totalBarrels` | Int | Total barrel count across all PrOs |
| `totalProofGallons` | Float | Total PG estimate |
| `totalCooks` | Int | Planned cook cycles |
| `totalFermenters` | Int | Planned fermenter count |
| `executedCooks` | Int | Completed cook cycles |
| `executedFermenters` | Int | Completed fermenter cycles |
| `totalGrainWeight` | Float | Total grain in lbs |
| `totalWaterVolume` | Float | Total water in gallons |
| `grainPerCook` | Float | Grain per cook cycle (lbs) |

### Schedule Order Timeline Fields

| Field | Description |
|---|---|
| `estimatedStart` / `estimatedEnd` | Overall production window |
| `estimatedMashingStartTime` / `Duration` | Mashing phase timing |
| `estimatedFermentationStartTime` / `Duration` | Fermentation phase timing |
| `estimatedDistillationStartTime` / `Duration` | Distillation phase timing |
| `estimatedBarrelingStartTime` | Barreling start |
| `actualStart` / `actualEnd` | Real timestamps |

## Container Type Reference

| Enum Value | Display Name | Item Group | Barrel Spec in Item# |
|---|---|---|---|
| `LargeBarrel` | Large Barrel (53 gal) | FG-BBL | 53-04-4-4-0 |
| `SmallBarrel` | Small Barrel | FG-BBL | 53-04-4-4-0 |
| `BulkLoadout` | Bulk Loadout | FG-DIS | 00-00-0-0-0 |
| `PlasticDrum` | Plastic Drum | FG-DIS | 00-00-0-0-0 |
| `IbcTote275` | 275-gal IBC Tote | FG-DIS | 00-00-0-0-0 |
| `SsTote275` | 275-gal SS Tote | FG-DIS | 00-00-0-0-0 |

## Whiskey Type Reference

| Enum Value | Description |
|---|---|
| `RyeBourbon` | Bourbon with rye as flavoring grain |
| `WheatedBourbon` | Bourbon with wheat as flavoring grain |
| `CornBourbon` | High corn content bourbon |
| `CornWhiskey` | Corn whiskey (not bourbon) |
| `RyeWhiskey` | Rye whiskey |
| `WheatWhiskey` | Wheat whiskey |
| `AmericanSingleMalt` | American single malt whiskey |

## BOM Calculation Modes

| Mode | When Used | Formula |
|---|---|---|
| `STATIC` | Fixed quantity | `quantity` from BOM item |
| `FORMULA_GRAIN` | Scales with grain | `grainLoad x multiplier` |
| `FORMULA_WATER` | Scales with water | `waterLoad x multiplier` |
| `ENZYME_NORMALIZED` | Enzyme dosing | Normalized per bushel x grain |
| `EXPRESSION` | Complex formulas | Custom expression engine |

## BOM Operations

| Operation | Production Phase |
|---|---|
| `Mashing01` | Mashing |
| `Fermentation01` | Fermentation |
| `Distillation01` | Distillation |
| `Processing01` | Processing |

## Recipe Instance Statuses

| Status | Meaning |
|---|---|
| `Created` | Instance initialized |
| `Active` | In use during production |
| `InSeparation` | Being split to PO-level |
| `Completed` | Production finished |
| `Cancelled` | Instance cancelled |

## Production Phases

| Phase | Typical Duration |
|---|---|
| Mashing | `totalCooks x 2 hours` |
| Fermentation | `72 hours + mashingDuration` |
| Distillation | Same as fermentation |
| Barreling | Follows distillation |

## Queue Position Quick Reference

| Position | Status | Action Available |
|---|---|---|
| 0 | Active/Running | Record cooks, update loads, advance |
| 1 | Next Up | Pre-created recipe instance, start order |
| 2+ | Queued | Reorder, deactivate |
| Not in queue | Created | Schedule, delete |

## Common GraphQL Queries

### Get Unlinked Production Orders
```graphql
query {
  getUnlinkedPendingProductionOrders {
    id
    name
    status
    customer { name }
    recipe { Recipe }
    containerType
    finalProof
    quantity
  }
}
```

### Get Schedule Order with Execution Status
```graphql
query GetScheduleOrder($id: String!) {
  scheduleOrder(where: { id: $id }) {
    id
    name
    status
    totalCooks
    executedCooks
    totalFermenters
    executedFermenters
    totalGrainWeight
    totalWaterVolume
    estimatedStart
    estimatedEnd
    productionOrders {
      id
      name
      customer { name }
      containerType
      finalProof
      quantity
    }
    scheduleOrderRecipeInstance {
      id
      status
      currentPhase
    }
  }
}
```

### Get Production Order with Relationships
```graphql
query GetProductionOrder($id: String!) {
  productionOrder(where: { id: $id }) {
    id
    name
    status
    quantity
    finalProof
    containerType
    scheduled
    customer { id name }
    recipe { id Recipe whiskeyType }
    scheduleOrder { id name status }
    bom { id name }
    item { id itemNumber }
  }
}
```

---

*See also: [Troubleshooting](./troubleshooting.md) | [Production Order Guide](./user-guide-production-orders.md) | [Schedule Order Guide](./user-guide-schedule-orders.md)*
