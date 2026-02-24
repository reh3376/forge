# Schedule Order UI Refactoring Plan

## Overview

This document outlines the comprehensive plan to refactor the MES UI to properly separate ProductionOrder (barrel/customer specifications) from ScheduleOrder (distillate production execution), following the schema migration that moved execution tracking fields from ProductionOrder to ScheduleOrder.

## Business Context

### Key Insight: Distillate Production vs Barrel Specification

**ScheduleOrder** = Distillate production run (one mash bill, one batch)
- Tracks: cooking, fermentation, distillation execution
- Fields: totalCooks, totalFermenters, executedCooks, timing, totalGrainWeight
- Purpose: Schedule and execute the production of bulk distillate

**ProductionOrder** = Barrel/packaging specification (how to package the distillate)
- Tracks: customer, proof, barrel type, quantity, FG item
- Fields: finalProof, containerType, quantity, customer
- Purpose: Define how the distillate gets proofed and barreled for specific customers

### Manufacturing Flow Example

```
ScheduleOrder: "Mash Bill #5 - Bourbon Run"
├─ Distillate Production: 8 cooks → 3 fermenters → distillation → 1000 PG @ 125 proof
└─ Split into ProductionOrders:
    ├─ PO-001: Customer A, 100 barrels, 115 proof, large barrels
    ├─ PO-002: Customer B, 50 barrels, 120 proof, small barrels
    └─ PO-003: Customer A, 75 barrels, 110 proof, large barrels
```

The distillery:
1. Makes the distillate once (ScheduleOrder execution)
2. Proofs/barrels it multiple ways (ProductionOrders)

This explains why:
- **Execution fields moved to ScheduleOrder**: You cook/ferment/distill ONCE per mash bill
- **Proof/barrel/customer on ProductionOrder**: You split the distillate into different specs
- **productionOrderAllocation**: Maps how much of the distillate batch goes to each customer order

## User Workflow

### Current Desired Flow

1. **Create ProductionOrders** (individual customer/barrel specs)
   - Customer, recipe/mash bill, quantity, proof, barrel type
   - These remain unscheduled initially

2. **Group into ScheduleOrder** (distillate production run)
   - Select multiple POs with matching mash bill
   - System calculates aggregate execution needs
   - Creates ScheduleOrder with timing/resource planning

3. **Edit/Manage ScheduleOrders** (production execution)
   - Modify execution parameters (cooks, fermenters, timing)
   - View/edit contained ProductionOrders
   - Track progress through production

### Two-Stage Data Model

**ProductionOrder (Stage 1: Specification)**
- Created independently by users
- Contains: customer, FG item, quantity, proof, barrel type, recipe
- Status: Unscheduled → Scheduled → Complete
- Lives in "Unscheduled Orders" list until grouped

**ScheduleOrder (Stage 2: Execution)**
- Created by grouping POs with same mash bill
- Contains: execution tracking (cooks, fermenters), timing, resource allocation
- Links to multiple ProductionOrders
- Lives in "Schedule Queue" for production management

---

## Phase 1: Critical Fixes - Get App Working (30-45 min)

### Status of Previous Work

**Already completed:**
- ✅ Fixed `graphql-queries.ts`
- ✅ Updated TypeScript interfaces in `scheduling/page.tsx`
- ✅ Fixed display sections for schedule queue
- ✅ Fixed ScheduleOrder update mutation logic

### Remaining Critical Fixes

#### 1.1 Remove Broken ProductionOrder Form Fields

**File:** `apps/mes-ui/app/scheduling/page.tsx`

**Issue:** Lines ~1976-2135 contain form sections trying to access fields that moved to ScheduleOrder:
- "Cook & Fermenter Counts" section
- "Production Estimations" section

**Action:**
- Delete entire "Cook & Fermenter Counts" section (totalCooks, totalFermenters, completedCooks, etc.)
- Delete "Production Estimations" section (estimatedBarrelsPerFermenter, estimatedPGsPerBbl, etc.)
- Keep only finalProof field (that's still on ProductionOrder)

**Reason:** These try to access `productionOrder.totalCooks`, `productionOrder.completedCooks`, etc. which don't exist anymore.

#### 1.2 Fix FutureOrderEditModal

**File:** `apps/mes-ui/components/schedule/FutureOrderEditModal.tsx`

**Changes:**
1. UPDATE_PRODUCTION_ORDER mutation (lines 53-74): Remove execution tracking fields
   - Remove: totalCooks, totalFermenters, completedCooks, completedFermenters, executedCooks, executedFermenters
   - Remove: estimatedBarrelsPerFermenter, estimatedPGsPerBbl, estimatedPGsPerBushel, totalGrainWeight
   - Keep: name, status, quantity, containerType, finalProof

2. Update TypeScript interfaces (lines 99-127)
   - Move execution fields from `productionOrders` array to `scheduleOrder` level
   - ProductionOrder interface should only have: id, name, status, quantity, containerType, finalProof

#### 1.3 Fix production-order-mutations

**File:** `apps/mes-ui/production-order-mutations.ts`

**Changes:**
1. Remove fields from mutations:
   - totalCooks, totalFermenters, totalGrainWeight

2. Remove validation logic (lines 170-177):
   - Delete completedCooks/totalCooks validation
   - Delete completedFermenters/totalFermenters validation

3. Update `ProductionOrderUpdateInput` interface (lines 113-116):
   - Remove execution tracking fields

#### 1.4 Fix AddToSchedule Components

**Files:**
- `apps/mes-ui/components/schedule/AddToScheduleDialog.tsx`
- `apps/mes-ui/components/schedule/AddToScheduleButton.tsx`
- `apps/mes-ui/hooks/useAddToSchedule.ts`

**Changes:**
- Update TypeScript interfaces to remove execution fields from ProductionOrder
- Access estimates from `scheduleOrder` after creation
- Update calculation logic to work with ScheduleOrder-level data

#### 1.5 Fix schedule-order-creation-workflow

**File:** `apps/mes-ui/components/production/schedule-order-creation-workflow.tsx`

**Changes:**
- Lines 112, 118: Verify accessing `createdScheduleOrder.totalCooks` (should already be correct - at ScheduleOrder level)

### Deliverable
✅ App loads without GraphQL errors, no undefined field access

---

## Phase 2: Workflow Architecture - Two-Stage UI (2-3 hours)

### 2.1 Production Order Creation (Stage 1)

#### Keep Existing ProductionOrder Wizard

**File:** `apps/mes-ui/components/production/production-order-wizard.tsx`

**Modifications:**
- Remove execution fields from wizard: cooks, fermenters, grain weight, estimates
- Focus on specification fields:
  - Customer, recipe, quantity, proof, barrel type
  - Control limits
  - FG item number
- Set initial status: `Planned` (not yet scheduled)
- On completion: Add to "Unscheduled Orders" list

#### New Component: Unscheduled Orders Panel

**Create:** `apps/mes-ui/components/production/UnscheduledOrdersPanel.tsx`

**Purpose:** Shows ProductionOrders where `scheduleOrderId` is null

**Features:**
- List view with filters (customer, recipe, date)
- Multi-select checkboxes for grouping
- "Add to Schedule" button (creates/joins ScheduleOrder)
- Sort/filter options

**Query:**
```graphql
query GetUnscheduledProductionOrders {
  productionOrders(
    where: {
      scheduleOrderId: { equals: null }
      status: { in: [Planned, Committed] }
    }
    orderBy: { createdAt: Desc }
  ) {
    id
    name
    status
    quantity
    finalProof
    containerType
    createdAt
    customer {
      id
      name
      customerCode
    }
    recipe {
      id
      Recipe
      whiskeyType
      customerCode
    }
  }
}
```

### 2.2 Schedule Order Creation (Stage 2)

#### Two Paths to Create ScheduleOrder

**Path A: From Unscheduled Orders (Primary)**
1. User selects 1+ ProductionOrders from unscheduled list
2. Click "Add to Schedule"
3. System validates: all have same mash bill
4. Dialog shows:
   - List of selected POs
   - Calculated totals (quantity, estimated cooks/fermenters)
   - Timing inputs (estimated start/end)
   - Resource allocation
5. Creates ScheduleOrder, links POs, adds to queue

**Path B: From Schedule Queue (Add to Existing)**
1. User selects existing ScheduleOrder from queue
2. Click "Add Orders to This Run"
3. Shows unscheduled POs filtered by matching mash bill
4. Select additional POs to add
5. Updates ScheduleOrder totals, updates PO links

#### Component: AddToScheduleDialog (Enhanced)

**File:** `apps/mes-ui/components/schedule/AddToScheduleDialog.tsx`

**Interface:**
```typescript
interface Props {
  selectedProductionOrders: ProductionOrder[]
  existingScheduleOrder?: ScheduleOrder  // optional, for adding to existing
  onComplete: () => void
}
```

**Features:**
- Shows PO details in table
- Calculates aggregate totals from POs
- Allows entry of execution parameters:
  - totalCooks, totalFermenters (defaults from calculation)
  - estimatedBarrelsPerFermenter, estimatedPGsPerBbl
  - timing: estimatedStart, estimatedEnd
  - phase durations (mashing, fermentation, distillation)
- Creates productionOrderAllocation JSON

**Backend Mutation:**
```graphql
mutation CreateScheduleOrderFromProductionOrders(
  $data: CreateScheduleOrderInput!
  $productionOrderIds: [String!]!
) {
  createScheduleOrderFromProductionOrders(
    data: $data
    productionOrderIds: $productionOrderIds
  ) {
    id
    name
    recipeName
    totalCooks
    totalFermenters
    estimatedStart
    estimatedEnd
    productionOrderAllocation
    productionOrders {
      id
      name
      scheduled
    }
  }
}
```

### 2.3 Schedule Order Management (Queue View)

#### Main Scheduling Page Layout

**File:** `apps/mes-ui/app/scheduling/page.tsx`

**New Structure:**
```
+--------------------------------------------------+
|  Scheduling Dashboard                            |
+--------------------------------------------------+
|                                                  |
|  [Unscheduled Orders]     [Schedule Queue]       |
|  +-------------------+    +-------------------+  |
|  | ProductionOrders  |    | ScheduleOrders    |  |
|  | waiting to be     |    | in queue for      |  |
|  | scheduled         |    | production        |  |
|  |                   |    |                   |  |
|  | [ ] PO-001        |    | #1 Mash Bill #5   |  |
|  | [ ] PO-002        |    |    8 cooks, 3 fm  |  |
|  | [ ] PO-003        |    |    Start: 3/15    |  |
|  |                   |    |    Contains: 3 POs|  |
|  | [Add to Schedule] |    |    [Edit] [Start] |  |
|  +-------------------+    +-------------------+  |
+--------------------------------------------------+
```

#### Schedule Queue Display

**Shows ScheduleOrders with:**
- Queue position, status badge
- Recipe name (mash bill)
- Execution summary: totalCooks, totalFermenters, timing
- Progress indicators (completedCooks/totalCooks)
- Action buttons: Edit, Move Up/Down, Start, Complete
- Expandable to show contained ProductionOrders

**Query:**
```graphql
query GetScheduleQueue {
  scheduleOrderQueues(orderBy: { queueIndex: Asc }) {
    id
    queueIndex
    scheduleOrder {
      # ScheduleOrder-level execution data
      id
      name
      recipeName
      status
      totalCooks
      totalFermenters
      completedCooks
      completedFermenters
      executedCooks
      executedFermenters
      estimatedBarrelsPerFermenter
      estimatedPGsPerBbl
      estimatedPGsPerBushel
      totalGrainWeight
      estimatedStart
      estimatedEnd
      actualStart
      actualEnd
      productionOrderAllocation

      # Nested ProductionOrders
      productionOrders {
        id
        name
        quantity
        finalProof
        containerType
        status
        customer {
          id
          name
        }
        recipe {
          id
          Recipe
        }
      }

      recipeGroup {
        id
        recipe
      }
    }
  }
}
```

### 2.4 Schedule Order Editing

#### Edit ScheduleOrder Dialog Structure

**Two Sections:**

**Section 1: Distillate Production (ScheduleOrder fields)**
```
Schedule Order: Mash Bill #5 Run
Recipe: Bourbon Mash Bill #5

Execution Parameters:
├─ Total Cooks:        [8]
├─ Total Fermenters:   [3]
├─ Grain Weight:       [18000 lbs]
├─ Bbls/Fermenter:     [25]
├─ PGs/Barrel:         [60]
└─ PGs/Bushel:         [2.5]

Timing:
├─ Estimated Start:    [3/15/2025 08:00]
├─ Estimated End:      [3/22/2025 16:00]
├─ Actual Start:       [empty]
└─ Actual End:         [empty]

Phase Durations:
├─ Mashing:            [8 hours]
├─ Fermentation:       [72 hours]
├─ Distillation:       [16 hours]
└─ Barreling:          [4 hours]

Progress Tracking:
├─ Completed Cooks:    [0] / 8
├─ Completed Ferms:    [0] / 3
├─ Executed Cooks:     [0] / 8
└─ Executed Ferms:     [0] / 3
```

**Section 2: Barrel Specifications (ProductionOrders table)**
```
Contained Customer Orders:

| Order # | Customer  | Quantity | Proof | Barrel Type  | Status    | Actions |
|---------|-----------|----------|-------|--------------|-----------|---------|
| PO-001  | Customer A|  100 bbl | 115°  | Large Barrel | Scheduled | [Edit]  |
| PO-002  | Customer B|   50 bbl | 120°  | Small Barrel | Scheduled | [Edit]  |
| PO-003  | Customer A|   75 bbl | 110°  | Large Barrel | Scheduled | [Edit]  |

[Add More Orders]  [Remove Selected]
```

**Features:**
- Edit ScheduleOrder execution fields in Section 1
- Edit individual ProductionOrder specs in Section 2
- Add/remove ProductionOrders from this run
- View productionOrderAllocation breakdown

#### Update Mutations

```graphql
# Update ScheduleOrder execution parameters
mutation UpdateScheduleOrder(
  $where: ScheduleOrderWhereUniqueInput!
  $data: ScheduleOrderUpdateInput!
) {
  updateScheduleOrder(where: $where, data: $data) {
    id
    name
    recipeName
    totalCooks
    totalFermenters
    completedCooks
    completedFermenters
    executedCooks
    executedFermenters
    estimatedBarrelsPerFermenter
    estimatedPGsPerBbl
    estimatedPGsPerBushel
    totalGrainWeight
    estimatedStart
    estimatedEnd
    actualStart
    actualEnd
    # ... other ScheduleOrder fields
  }
}

# Update individual ProductionOrder specs
mutation UpdateProductionOrder(
  $where: ProductionOrderWhereUniqueInput!
  $data: ProductionOrderUpdateInput!
) {
  updateProductionOrder(where: $where, data: $data) {
    id
    name
    quantity
    finalProof
    containerType
    status
    # ... ProductionOrder fields only (no execution fields)
  }
}
```

---

## Phase 3: Clean Separation of Concerns (1-2 hours)

### 3.1 TypeScript Type Safety

#### Clear Interface Definitions

```typescript
// Production Order = Barrel/Customer Specification
interface ProductionOrder {
  // Identity
  id: string
  name: string
  globalId?: string

  // Specification
  customer: Customer
  recipe: Recipe
  quantity: number
  finalProof: number
  containerType: ContainerType
  upperControlLimit?: number
  lowerControlLimit?: number

  // Status & Relationships
  status: ProductionOrderStatus
  scheduled: boolean
  scheduleOrderId?: string  // Link to parent ScheduleOrder

  // Metadata
  createdAt: DateTime
  createdBy: string
  updatedAt: DateTime

  // NO execution tracking fields (moved to ScheduleOrder)
}

// Schedule Order = Distillate Production Run
interface ScheduleOrder {
  // Identity
  id: string
  name: string
  recipeName: string
  globalId?: string

  // Recipe/Grouping
  recipeGroup: RecipeGroup
  scheduleOrderRecipe?: Recipe

  // Execution Tracking (THESE are the moved fields)
  totalCooks: number
  totalFermenters: number
  plannedCooks?: number
  plannedFermenters?: number
  executedCooks?: number
  executedFermenters?: number
  completedCooks?: number
  completedFermenters?: number

  // Production Estimates
  estimatedBarrelsPerFermenter?: number
  estimatedPGsPerBbl?: number
  estimatedPGsPerBushel?: number
  totalGrainWeight?: number

  // Timing
  estimatedStart?: DateTime
  estimatedEnd?: DateTime
  actualStart?: DateTime
  actualEnd?: DateTime
  duration?: number
  durationUnits?: string
  estimatedMashingDuration?: number
  estimatedFermentationDuration?: number
  estimatedDistillationDuration?: number

  // Aggregates
  totalBarrels?: number
  totalProofGallons?: number

  // Status & Relationships
  status: ScheduleOrderStatus
  productionOrders: ProductionOrder[]
  productionOrderAllocation: ProductionOrderAllocationMap
  scheduleOrderQueues?: ScheduleOrderQueue

  // Metadata
  createdAt: DateTime
  createdBy?: string
  updatedAt: DateTime
}

// Allocation mapping
interface ProductionOrderAllocationMap {
  totalCooks: number
  totalFermenters: number
  totalExpectedPG: number
  allocations: Array<{
    productionOrderId: string
    allocatedCooks: number
    allocatedFermenters: number
    expectedBarrels: number
    expectedPG: number
  }>
}
```

### 3.2 Component Organization

#### New File Structure

```
apps/mes-ui/components/
├── production/
│   ├── production-order-wizard.tsx          # Create PO (specs only)
│   ├── production-order-form.tsx            # Edit PO specs
│   ├── production-order-list.tsx            # List unscheduled POs
│   └── production-order-card.tsx            # Display PO summary
├── schedule/
│   ├── schedule-order-form.tsx              # Edit ScheduleOrder execution
│   ├── schedule-order-card.tsx              # Display ScheduleOrder in queue
│   ├── schedule-order-detail.tsx            # Expanded view with POs
│   ├── AddToScheduleDialog.tsx              # Group POs into ScheduleOrder
│   ├── ScheduleQueue.tsx                    # Queue management
│   └── ExecutionTracking.tsx                # Progress tracking component
└── scheduling/
    └── SchedulingDashboard.tsx              # Main page: Unscheduled + Queue
```

### 3.3 Query/Mutation Organization

#### Separate Files by Entity

```
apps/mes-ui/lib/api/
├── production-order-queries.ts
│   └── GET_UNSCHEDULED_ORDERS
│   └── CREATE_PRODUCTION_ORDER
│   └── UPDATE_PRODUCTION_ORDER
├── schedule-order-queries.ts
│   └── GET_SCHEDULE_QUEUE
│   └── CREATE_SCHEDULE_ORDER
│   └── UPDATE_SCHEDULE_ORDER
└── schedule-grouping-mutations.ts
    └── CREATE_SCHEDULE_FROM_POS
    └── ADD_POS_TO_SCHEDULE
    └── REMOVE_PO_FROM_SCHEDULE
```

---

## Phase 4: User Experience Enhancements (Optional, 1-2 hours)

### 4.1 Terminology Clarity

#### UI Labels

**Terminology mapping:**
- "Production Order" → Keep (users understand this)
- "Schedule Order" → "Production Run" or "Batch Run" (clearer purpose)
- "Unscheduled Orders" → "Orders to Schedule"
- "Schedule Queue" → "Production Schedule" or "Active Batches"

### 4.2 Workflow Helpers

#### Smart Grouping Suggestions

```
When user selects POs:
├─ Auto-filter by mash bill compatibility
├─ Show warning if different mash bills selected
├─ Suggest optimal grouping (e.g., "These 3 orders can run together")
└─ Calculate aggregate totals in real-time
```

#### Drag-and-Drop

```
Drag ProductionOrders from unscheduled list → Drop on ScheduleOrder in queue
└─ Validates mash bill match
└─ Updates ScheduleOrder totals
└─ Links PO to ScheduleOrder
```

### 4.3 Allocation Visualization

#### Show productionOrderAllocation Breakdown

```
Production Run: Mash Bill #5 (8 cooks, 3 fermenters)

Allocation:
[████████] Customer A - Order #1: 3 cooks, 1 ferm → 100 bbls @ 115°
[█████]    Customer B - Order #2: 2 cooks, 1 ferm → 50 bbls @ 120°
[███████]  Customer A - Order #3: 3 cooks, 1 ferm → 75 bbls @ 110°

Total Distillate: 1000 PG → Split into 225 barrels
```

---

## Implementation Timeline

### Week 1: Critical Path (Get Working)

#### Day 1-2: Phase 1 - Critical Fixes
- Remove broken form fields from scheduling page
- Fix FutureOrderEditModal, production-order-mutations
- Fix AddToSchedule components
- **Test:** App loads, no GraphQL errors

#### Day 3-4: Phase 2 Part 1 - Creation Flow
- Add UnscheduledOrdersPanel component
- Enhance AddToScheduleDialog
- Update ProductionOrder wizard (remove execution fields)
- **Test:** Can create POs, group into ScheduleOrders

#### Day 5: Phase 2 Part 2 - Queue Management
- Refactor schedule queue view to be ScheduleOrder-centric
- Update edit dialog structure (two sections)
- **Test:** Can edit ScheduleOrders and contained POs

### Week 2: Polish (If Needed)

#### Day 1-2: Phase 3 - Clean Architecture
- Reorganize components into proper structure
- Separate query/mutation files
- Add comprehensive TypeScript types

#### Day 3-4: Phase 4 - UX Enhancements
- Update terminology
- Add smart grouping helpers
- Add allocation visualization

#### Day 5: Testing & Documentation
- E2E testing of full workflow
- Update documentation
- User acceptance testing

---

## Success Criteria

**Phase 1:** ✅ No GraphQL errors, app loads successfully

**Phase 2:** ✅ Can create POs → group into ScheduleOrders → manage queue

**Phase 3:** ✅ Clear code organization, type-safe interfaces

**Phase 4:** ✅ Intuitive UX, helpful workflow assistants

---

## Key Files to Modify

### Phase 1 (Critical Fixes)

1. `apps/mes-ui/app/scheduling/page.tsx` - Remove broken forms
2. `apps/mes-ui/components/schedule/FutureOrderEditModal.tsx` - Fix mutations
3. `apps/mes-ui/production-order-mutations.ts` - Remove moved fields
4. `apps/mes-ui/hooks/useAddToSchedule.ts` - Update types
5. `apps/mes-ui/components/schedule/AddToScheduleDialog.tsx` - Fix field access
6. `apps/mes-ui/components/schedule/AddToScheduleButton.tsx` - Update interface
7. `apps/mes-ui/components/production/schedule-order-creation-workflow.tsx` - Fix display

### Phase 2 (Architecture)

8. `apps/mes-ui/components/production/UnscheduledOrdersPanel.tsx` - **NEW**
9. `apps/mes-ui/components/schedule/ScheduleOrderForm.tsx` - **NEW**
10. `apps/mes-ui/app/scheduling/page.tsx` - Refactor layout
11. `apps/mes-ui/components/production/production-order-wizard.tsx` - Remove execution fields
12. `apps/mes-ui/components/schedule/AddToScheduleDialog.tsx` - Enhance

### Phase 3 (Organization)

13. Create separate query/mutation files
14. Reorganize component structure
15. Add comprehensive TypeScript types

### Phase 4 (Enhancements)

16. Update UI labels and terminology
17. Add smart grouping helpers
18. Add allocation visualization components

---

## Notes

- This plan maintains the desired workflow: **create POs → group into ScheduleOrders → manage queue**
- Properly separates **specification** (ProductionOrder) from **execution** (ScheduleOrder)
- Aligns with manufacturing reality: **one distillate run, multiple barrel specifications**
- Leverages the existing `productionOrderAllocation` JSON field for detailed tracking
- Phase 1 gets the app working; subsequent phases improve architecture and UX
