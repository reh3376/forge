# Production Order User Guide

## What is a Production Order?

A Production Order (PrO) represents a specific commitment to produce a finished whiskey product for a single customer. Each PrO defines exactly what will be produced: the grain recipe, proof level, container type, and quantity.

Think of a PrO as a contract: "We will produce X barrels of Y whiskey at Z proof for Customer A, packaged in large barrels."

## Key Concepts

### One-of Constraints

Every Production Order must specify exactly **one** value for each critical dimension:

- **One Customer** — who receives the product
- **One Mash Bill** — which grain recipe (via the linked recipe)
- **One Container Type** — how the product is packaged
- **One Final Proof** — the target alcohol proof
- **One BOM** — the Bill of Materials (ingredients list)
- **One FG Item Code** — the finished goods identifier (auto-generated)

These constraints exist because each PrO maps to a unique finished good in the ERP system (NetSuite). The auto-generated item number encodes these dimensions so each combination is traceable.

### Container Types

| Type | Description | Use Case |
|---|---|---|
| **LargeBarrel** | Standard 53-gallon barrel | Default for aged whiskey production |
| **SmallBarrel** | Smaller barrel format | Craft/specialty runs |
| **BulkLoadout** | Bulk liquid transfer | Wholesale/bulk customers |
| **PlasticDrum** | Plastic drum container | Transport/interim storage |
| **IbcTote275** | 275-gallon IBC tote | Large volume non-barrel |
| **SsTote275** | 275-gallon stainless steel tote | Large volume non-barrel |

Container type affects item classification:
- LargeBarrel/SmallBarrel items are classified as **FG-BBL** (finished goods - barrel)
- All other types are classified as **FG-DIS** (finished goods - distillate)

## Creating a Production Order

### Using the Production Order Wizard

The wizard is the primary way to create PrOs. It collects all required information in a structured flow and handles item generation, BOM creation, and optional auto-scheduling in a single operation.

#### Step 1: Order Details

Provide the core order information:
- **Order Name** — unique identifier for this order
- **Customer Code** — select the customer
- **Quantity** — number of barrels/containers to produce
- **Units** — measurement units for the quantity
- **Start Date / End Date** — planned production window
- **Priority** — production priority (default: medium)
- **Notes** — optional comments

#### Step 2: Recipe and Proof

Select the recipe and specify proof:
- **Recipe** — choose the master recipe (determines mash bill)
- **Whiskey Type** — the type of whiskey (e.g., RyeBourbon, WheatedBourbon)
- **Final Proof** — target proof level (must be > 0)
- **Container Type** — select from the available types
- **Upper/Lower Control Limits** — quality KPI thresholds

#### Step 3: Production Planning

Specify or review production estimates:
- **Fermenters** — number of fermenters needed
- **Cooks** — number of cook cycles
- **Total Grain Load** — total grain weight
- **Estimated Barrels per Fermenter**
- **Estimated Proof Gallons per Bushel**
- **Estimated Proof Gallons per Barrel**

These values can be calculated automatically by the yield estimation system or entered manually.

#### Step 4: Bill of Materials

Review and confirm BOM items:
- Each BOM item includes: item code, name, quantity, unit, category, item group
- BOM items are created or linked to existing items in the system
- The BOM is named `{orderName}-BOM`

#### Step 5: Bin Configuration

Configure milling bin assignments:
- **SIL110, SIL115, SIL120** — milling bin configuration IDs
- **Cooks per Fermenter** — cook cycles per fermenter
- **Entry Proof** — proof at barrel entry
- **Proof Gallons per Barrel**
- **Barrels per Fermenter**

#### Step 6: Schedule (Optional)

If auto-scheduling is enabled:
- **Estimated Start/End** — scheduling window
- **Total Barrels / Total Proof Gallons** — production targets
- **Duration / Duration Units** — expected production time

### What Happens Behind the Scenes

When you submit the wizard:

1. **Validation** — recipe, customer, and units are verified
2. **Item number generated** — using the format `{CUSTOMER}-{MASHBILL}-{BARREL}-{PROOF}-R01`
3. **Item created or found** — if an identical item number exists, it's reused
4. **BOM created** — with all specified BOM items
5. **Recipe group assigned** — auto-created if needed for the mash bill
6. **Production Order created** — with all relationships linked
7. **Auto-scheduled** (if enabled) — creates a Schedule Order and queue entry

### Item Number Format

The system generates a unique item number encoding key dimensions:

```
ACME-75-21-00-04-53-04-4-4-0-120-R01
│     │            │           │   │
│     │            │           │   └─ Revision (always R01 for new)
│     │            │           └─── Final proof
│     │            └─────────────── Barrel specs (53-04-4-4-0 for barrels, 00-00-0-0-0 for others)
│     └──────────────────────────── Mash bill (from recipe name)
└────────────────────────────────── Customer code
```

The mash bill is extracted from the recipe name pattern (e.g., `DWL-75-21-00-04-R01`). If no pattern is found, the default `70-20-08-02` is used.

## Status Lifecycle

### Status Definitions

| Status | Meaning | How It's Set |
|---|---|---|
| **Initiated** | Order created, not yet scheduled | Default on creation |
| **Planned** | Order planned for production | Manual update |
| **Committed** | Resources committed, on the schedule | Auto-set when SchO is Scheduled |
| **InProgress** | Production actively underway | Auto-set when SchO is InProgress |
| **Complete** | Production finished | Auto-set when SchO is Complete |
| **Cancelled** | Order cancelled | Manual — only from Planned or Initiated |

### Status Flow

```
                    ┌──────────┐
          ┌────────→│ Cancelled │
          │         └──────────┘
          │
┌─────────┴─┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│ Initiated  │────→│ Committed│────→│ InProgress│────→│ Complete │
└────────────┘     └──────────┘     └───────────┘     └──────────┘
                         ↑                ↑                ↑
                   SchO Scheduled   SchO InProgress   SchO Complete
```

### Cancellation Rules

- Only orders with status **Planned** or **Initiated** can be cancelled
- Orders linked to a Schedule Order **cannot** be cancelled directly — remove them from the schedule first
- Cancellation is irreversible

## Common Validation Errors

| Error Message | Cause | Fix |
|---|---|---|
| "Container type is required for MES Phase 1 compliance" | No container type selected | Select a container type in the wizard |
| "Final proof is required and must be greater than 0" | Proof missing or zero | Enter a valid proof value |
| "Customer is required for MES Phase 1 compliance" | No customer selected | Select a customer |
| "BOM is required for MES Phase 1 compliance" | No BOM items provided | Add at least one BOM item |
| "Item is required for MES Phase 1 compliance" | Item creation failed | Check units exist in the system |
| "Cannot have multiple container items" | More than one container item linked | Remove extra container items |
| "Cannot cancel a production order with status {status}" | Trying to cancel InProgress/Complete order | Order must be Planned or Initiated |
| "Delete operations are not allowed for ProductionOrder" | Attempting to delete a PrO | Cancel instead of delete |

## Best Practices

### Order Creation
- **Verify the recipe** exists and belongs to the correct recipe group before creating a PrO
- **Double-check proof and container type** — these directly affect the item number and ERP classification
- **Use auto-scheduling** when possible to ensure the PrO is immediately queued for production
- **Provide accurate planning estimates** (cooks, fermenters, grain load) for better timeline calculations

### Order Management
- **Group compatible PrOs** into Schedule Orders early to enable production planning
- **Monitor status transitions** — PrO status is automatically cascaded from the Schedule Order
- **Use the yield estimation system** for production planning rather than manual estimates
- **Don't cancel orders that have started production** — work with the schedule to adjust instead

### Naming Conventions
- Use descriptive order names that include customer and date information
- The system auto-generates item numbers — don't try to override the format
- BOM names follow the pattern `{orderName}-BOM`

---

*See also: [Architecture](./architecture.md) | [Schedule Order User Guide](./user-guide-schedule-orders.md) | [Order Relationships](./order-relationships.md) | [Quick Reference](./quick-reference.md)*
