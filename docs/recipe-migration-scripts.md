# Recipe & Mashing Protocol Migration Scripts

This document describes the migration and backfill scripts for managing recipe data, BOM items, and mashing protocols in the MES system. These scripts transform data from the legacy `EquipmentPhase` structure into the new normalized schema.

---

## Execution Order

**Important**: Scripts must be run in this order due to data dependencies:

1. **Recipe Parameters** - Link recipe parameter values
2. **Recipe BOM Items** - Populate bill of materials
3. **Mashing Protocols** - Create protocols and steps (depends on BOM items for grain type detection)

---

## 1. Recipe Parameters

### Link Recipe Parameters

**Script**: `scripts/seed/link-recipe-parameters.ts`
**Command**: `npm run migrate:link-recipe-parameters`

Links recipe parameter values from phase parameters to recipe records.

**What it does**:
- Finds recipes with unit procedures containing phase parameters
- Extracts parameter values (setpoints, limits, etc.)
- Links parameters to the recipe for easy access

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:link-recipe-parameters
```

---

## 2. Recipe BOM Items

### Populate Missing BOM Items

**Script**: `scripts/seed/migrate-populate-missing-recipe-bom-items.ts`
**Command**: `npm run migrate:populate-bom-items`

Populates `RecipeBom` records from `EquipmentPhaseBomItem` data.

**What it does**:
- Finds recipes missing BOM items
- Extracts items from equipment phase BOM data
- Creates RecipeBom entries with:
  - Item references
  - Quantities and units
  - Operation/phase indices for step matching

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:populate-bom-items
```

### Cleanup BOM Items

**Script**: `scripts/seed/cleanup-migration-bom-items.ts`
**Command**: `npm run migrate:cleanup-bom-items`

Removes migrated BOM items for re-population.

**Use case**: Run before `populate-bom-items` to clear old data and regenerate.

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:cleanup-bom-items
```

### Verify BOM Completeness

**Script**: `scripts/seed/diagnose-recipe-bom-completeness.ts`
**Command**: `npm run migrate:diagnose-bom-completeness`

Analyzes BOM item coverage and identifies missing items.

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:diagnose-bom-completeness
```

---

## 3. Mashing Protocols

### Backfill Mashing Protocols

**Script**: `scripts/seed/backfill-mashing-protocols-from-equipment-phases.ts`
**Command**: `npm run migrate:backfill-mashing-protocols`

Creates `MashingProtocol` and `MashingProtocolStep` records from `EquipmentPhase` data.

**What it does**:
- Finds recipes without mashing protocols
- Locates the Mashing01 UnitProcedure with Cook operations
- Extracts equipment phases (LiquidAdd, GrainAdd, AdditiveAdd, Hold types)
- Creates protocol steps with proper types and parameters
- Links BOM items to steps

**Step Types Created**:
- `LiquidAdd` - Water/liquid additions
- `Hold` - Temperature hold steps
- `GrainAdd` - **Consolidated grain addition** (recommended, grain type derived from linked BOM item)
- `Corn`, `Wheat`, `Rye`, `Malt`, `PreMalt` - Legacy grain additions (kept for backward compatibility)
- `AdditiveAdd` - Enzyme/additive additions
- `Prompt` - Operator prompts

> **Note**: As of 2026-02, the backfill scripts use the consolidated `GrainAdd` step type by default.
> The specific grain type (Corn, Wheat, Rye, Malt) is derived at runtime from the linked BOM item's name.
> See [GrainAdd Consolidation](#grainadd-step-type-consolidation) section for details.

**Hold Step Parameters**:
- `holdType`: Heat/Cool/Hold (determined from `phase.stepType` field)
- `temperatureSetpoint`: Target temperature
- `heatTempSp`: Heat setpoint (when holdType = Heat)
- `coolTempSp`: Cool setpoint (when holdType = Cool)
- `stepTime`: Duration in minutes

**Key Logic**:

1. **Hold Type Determination** - Uses `EquipmentPhase.stepType` field:
   ```typescript
   function getHoldType(stepType?: string | null): EnumMashingProtocolStepHoldType {
     if (stepType === 'Heat') return EnumMashingProtocolStepHoldType.Heat
     if (stepType === 'Cool') return EnumMashingProtocolStepHoldType.Cool
     return EnumMashingProtocolStepHoldType.Hold
   }
   ```

2. **Temperature Extraction** - From parameters with `staticName === 'Temperature'`

3. **Grain Type Handling** - Two modes available (controlled by `USE_CONSOLIDATED_GRAIN_ADD` flag):

   **Mode A: Consolidated GrainAdd (Default, Recommended)**
   ```typescript
   USE_CONSOLIDATED_GRAIN_ADD = true  // Default in scripts
   ```
   - All grain phases create `GrainAdd` step type
   - Grain type (Corn, Wheat, Rye, Malt) derived at runtime from linked BOM item name
   - Simpler schema, no redundant parameter definitions per grain type

   **Mode B: Legacy Individual Grain Types**
   ```typescript
   USE_CONSOLIDATED_GRAIN_ADD = false
   ```
   - BOM items analyzed for keywords to determine specific type:
     - **Corn**: "corn", "maize", "crn"
     - **Rye**: "rye"
     - **Wheat**: "wheat", "wht"
     - **Malt**: "malt", "barley", "bry"
   - Fallback to `Hold` if no grain match found

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:backfill-mashing-protocols
```

### Cleanup Mashing Protocols

**Script**: `scripts/seed/cleanup-incorrect-mashing-protocols.ts`
**Command**: `npm run migrate:cleanup-mashing-protocols`

Removes incorrectly backfilled protocols for re-generation.

**What it does**:
- Deletes all MashingProtocolStep records
- Unlinks recipes from protocols
- Deletes MashingProtocol records

**Use case**: Run before backfill to clear old data and regenerate with fixes.

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:cleanup-mashing-protocols
```

### Copy Protocols by Mashbill

**Script**: `scripts/seed/copy-mashing-protocols-by-mashbill.ts`
**Command**: `npm run migrate:copy-protocols-by-mashbill`

Copies mashing protocols between recipes with matching mashbill compositions.

**Use case**: When multiple recipes share the same grain bill percentages, copy the protocol from one to another.

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:copy-protocols-by-mashbill
```

### Verify Backfill Results

**Script**: `scripts/seed/verify-backfill-matching.ts`
**Command**: `npm run migrate:verify-backfill`

Verifies that backfilled data matches source equipment phase data.

**Usage**:
```bash
DB_URL=postgresql://... npm run migrate:verify-backfill
```

---

## Complete Migration Workflow

### Full Re-backfill Sequence

```bash
# Set database URL
export DB_URL=postgresql://postgres:password@host:port/database

# 1. Link recipe parameters
npm run migrate:link-recipe-parameters

# 2. Cleanup and populate BOM items
npm run migrate:cleanup-bom-items
npm run migrate:populate-bom-items

# 3. Cleanup and backfill mashing protocols
npm run migrate:cleanup-mashing-protocols
npm run migrate:backfill-mashing-protocols

# 4. Verify results
npm run migrate:verify-backfill
```

### Quick Protocol Re-backfill Only

```bash
export DB_URL=postgresql://...

npm run migrate:cleanup-mashing-protocols && npm run migrate:backfill-mashing-protocols
```

---

## Data Model Relationships

```
Recipe
├── RecipeBom[] (bill of materials)
│   ├── item (Item reference)
│   ├── quantity / quantityPer
│   ├── units
│   └── operationIndex / phaseIndex (for step matching)
│
├── MashingProtocol
│   └── MashingProtocolStep[]
│       ├── stepType (LiquidAdd/Hold/Corn/Wheat/Rye/Malt/etc)
│       ├── holdType (Heat/Cool/Hold) - only for Hold steps
│       ├── temperatureSetpoint / heatTempSp / coolTempSp
│       ├── stepTime
│       ├── agitatorEnabled / agitatorSpdSp
│       └── RecipeBom[] (linked items for this step)
│
└── UnitProcedure (source data)
    └── Operations[]
        └── EquipmentPhases[]
            ├── stepType (Heat/Cool/Hold/NotRequired)
            ├── PhaseParameters[] (Temperature, Time, Speed, etc.)
            └── EquipmentPhaseBomItem[]
```

---

## Diagnostic Scripts

These scripts help investigate and debug migration issues:

| Script | Command | Purpose |
|--------|---------|---------|
| `diagnose-unit-procedure-structure.ts` | `migrate:diagnose-unit-procedures` | Analyze unit procedure hierarchy |
| `diagnose-recipe-bom-completeness.ts` | `migrate:diagnose-bom-completeness` | Check BOM item coverage |
| `check-pvs-bom.ts` | `migrate:check-pvs-bom` | Check PVS recipe BOM items |

### PVS Recipe Debugging

Several scripts exist for debugging PVS (a specific recipe family) issues:

- `check-pvs-*.ts` - Various PVS-specific checks
- `diagnose-pvs-*.ts` - PVS diagnostics
- `verify-pvs-*.ts` - PVS verification

---

## Seeding System

The modular seeding system in `scripts/seed/modules/` can also be used to seed recipe data:

| Module | Purpose |
|--------|---------|
| `recipes.ts` | Recipe seeding |
| `recipe-boms.ts` | BOM item seeding |
| `mashing-protocols.ts` | Protocol seeding |
| `mashing-protocol-steps.ts` | Step seeding |
| `recipe-parameters.ts` | Parameter seeding |

**Run seeding**:
```bash
npm run seed:all           # Seed everything
npm run seed:interactive   # Interactive CLI
npm run seed:verify        # Verify seed status
```

---

## Troubleshooting

### Hold steps showing wrong holdType

**Problem**: All hold steps show "Hold" instead of "Heat" or "Cool"

**Solution**: The backfill now uses `EquipmentPhase.stepType` field which contains Heat/Cool/Hold values. Re-run the backfill:

```bash
npm run migrate:cleanup-mashing-protocols && npm run migrate:backfill-mashing-protocols
```

### Temperature setpoints showing as 0

**Problem**: Hold steps have 0 for temperature values

**Solution**: Temperature is extracted from parameters with `staticName === 'Temperature'`. Ensure source data has this parameter. The backfill assigns:
- `heatTempSp` when holdType = Heat
- `coolTempSp` when holdType = Cool
- `temperatureSetpoint` always set

### GrainAdd steps showing as "Hold"

**Problem**: Grain addition phases become Hold step types

**Cause**: Running with legacy mode (`USE_CONSOLIDATED_GRAIN_ADD = false`) and BOM analysis couldn't determine grain type

**Solution**:
- **Recommended**: Use consolidated mode (default). Steps will be `GrainAdd` type.
- **Legacy mode**: This is expected when BOM items don't contain grain keywords. The system falls back to Hold when it can't identify the grain type.

### New protocols should use GrainAdd

**Problem**: Want new protocols to use consolidated `GrainAdd` type

**Solution**: Ensure `USE_CONSOLIDATED_GRAIN_ADD = true` in backfill scripts (this is the default).

### GrainAdd enum not found in database

**Problem**: Backfill fails with "invalid input value for enum: GrainAdd"

**Cause**: Database schema doesn't have the `GrainAdd` enum value

**Solution**: Add the enum value before running backfill:
```bash
echo "ALTER TYPE \"EnumMashingProtocolStepStepType\" ADD VALUE IF NOT EXISTS 'GrainAdd';" | npx prisma db execute --stdin
```

### Missing BOM item linkages

**Problem**: Steps don't have linked BOM items

**Cause**: BOM items not populated before mashing protocol backfill

**Solution**: Run migrations in order:
1. `migrate:populate-bom-items`
2. `migrate:backfill-mashing-protocols`

---

## GrainAdd Step Type Consolidation

### Background

The schema previously had 6 separate grain step types:
- `Corn`, `Wheat`, `Rye`, `Malt`, `PreMalt`, `SpecialtyGrainAdd`

All 6 types had **identical parameters**: `grainQuantity`, `addRate`, `temperatureAtAddition`.

### New Approach (2026-02)

A consolidated `GrainAdd` step type replaces individual grain types:

| Before | After |
|--------|-------|
| `stepType: "Corn"` | `stepType: "GrainAdd"` + linked BOM item "Yellow Corn #2" |
| `stepType: "Wheat"` | `stepType: "GrainAdd"` + linked BOM item "Soft Wheat" |
| `stepType: "Rye"` | `stepType: "GrainAdd"` + linked BOM item "Rye Grain" |

**Benefits**:
- Single set of parameter definitions for all grains (3 records vs 18)
- New grain types don't require schema changes
- Grain categorization derived from BOM item, which already knows the grain type

**How It Works**:
1. `MashingProtocolStep.stepType = "GrainAdd"`
2. Step is linked to `RecipeBomItem` (e.g., "Yellow Corn #2")
3. At runtime, `MashingExecutionService.getGrainTypeFromBomItem()` parses item name
4. Returns derived grain type: `"Corn"`, `"Wheat"`, `"Rye"`, `"Malt"`, etc.
5. UI displays: `"Corn Add: Yellow Corn #2"`

**Grain Type Detection Logic**:
```typescript
private getGrainTypeFromBomItem(item: { itemName?: string | null }): string | null {
  if (!item?.itemName) return null;
  const name = item.itemName.toLowerCase();

  if (name.includes('corn')) return 'Corn';
  if (name.includes('wheat')) return 'Wheat';
  if (name.includes('rye')) return 'Rye';
  if (name.includes('malt') || name.includes('barley')) return 'Malt';
  if (name.includes('oat')) return 'Oats';
  if (name.includes('spelt')) return 'Spelt';
  if (name.includes('sorghum')) return 'Sorghum';
  if (name.includes('rice')) return 'Rice';

  return 'Specialty Grain';
}
```

### Backward Compatibility

Legacy step types (`Corn`, `Wheat`, `Rye`, `Malt`, `PreMalt`, `SpecialtyGrainAdd`) continue to work:
- Existing protocols with legacy types don't need migration
- Parameter definitions exist for both legacy types and `GrainAdd`
- Execution sheet displays legacy type directly if `GrainAdd` is not used

---

## Production Deployment Checklist

### Pre-Deployment: Database Schema

**1. Add GrainAdd enum value to PostgreSQL** (required before running backfill):

```bash
# Connect to production database and run:
echo "ALTER TYPE \"EnumMashingProtocolStepStepType\" ADD VALUE IF NOT EXISTS 'GrainAdd';" | npx prisma db execute --stdin
```

Or via Prisma:
```bash
npx prisma db push --accept-data-loss
```

**2. Seed GrainAdd parameter definitions**:

```bash
DB_URL=<production-url> npx ts-node scripts/seed/seed-mashing-step-parameters.ts
```

Expected output:
```
✅ Created "GrainAdd.grainQuantity" (Material)
✅ Created "GrainAdd.addRate" (Material)
✅ Created "GrainAdd.temperatureAtAddition" (Temperature)
```

### Backfill Options

**Option A: New protocols only (recommended for production)**

New recipes created after deployment will use `GrainAdd`. Existing protocols remain unchanged.

No backfill action required.

**Option B: Re-backfill all protocols**

To update ALL protocols to use `GrainAdd`:

```bash
export DB_URL=<production-url>

# 1. Clean up existing protocols
npm run migrate:cleanup-mashing-protocols

# 2. Re-backfill with GrainAdd
npm run migrate:backfill-mashing-protocols

# 3. Verify
npm run migrate:verify-backfill
```

**⚠️ Warning**: This will recreate all mashing protocols. Ensure no production runs are in progress.

### Configuration Flag

The backfill scripts have a configuration flag:

```typescript
// In backfill-mashing-protocols-from-equipment-phases.ts
// In railway-data-restore.ts

const USE_CONSOLIDATED_GRAIN_ADD = true  // Default: use GrainAdd
```

To use legacy behavior (individual grain types), set to `false` before running.

### Verification

After deployment, verify:

```bash
# 1. Check parameter definitions
DB_URL=<url> npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.mashingStepParameterDefinition.groupBy({ by: ['stepType'], _count: true })
  .then(console.log).finally(() => p.\$disconnect());
"

# 2. Check step type distribution
DB_URL=<url> npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.mashingProtocolStep.groupBy({ by: ['stepType'], _count: true })
  .then(console.log).finally(() => p.\$disconnect());
"
```

### Rollback

If issues arise, legacy grain types still work. No rollback action needed for the schema change (enum values cannot be removed but won't cause issues).
