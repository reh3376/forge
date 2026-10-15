# New Seed Migrations

This document describes the new Prisma migrations created from existing working seed scripts to ensure consistent data seeding across environments.

## Migration Overview

The following migrations have been created to seed essential data from working seed scripts:

### 1. Recipe Parameters Migration
- **File**: `20250130000001_seed_recipe_parameters/migration.sql`
- **Source**: `scripts/seed.prod.recipeParameters.ts`
- **Description**: Seeds recipe parameter class definitions for fermentation, mashing, distillation, and aging processes
- **Data**: 16 recipe parameter definitions including temperature, time, pH, and volume parameters

### 2. Test Parameters Migration
- **File**: `20250130000002_seed_test_parameters/migration.sql`
- **Source**: `scripts/seed.prod.tests.ts`
- **Description**: Seeds test parameter class definitions for quality control testing
- **Data**: 8 test parameter definitions including grain quality, contamination, chemical analysis, and sensory tests

### 3. Unit Links Migration
- **File**: `20250130000003_seed_unit_links/migration.sql`
- **Source**: `scripts/seed.prod.unitLink.ts`
- **Description**: Seeds unit lookup table with conversion rates and relationships
- **Data**: 9 unit definitions including mass, grain bushel, and enzyme container units

### 4. Enzyme System Configurations Migration
- **File**: `20250130000004_seed_enzyme_system_configs/migration.sql`
- **Source**: `scripts/seed.enzyme.systemconfig.ts`
- **Description**: Seeds system configuration values for enzyme calculations
- **Data**: 4 system configuration values (divisor, cache TTL, precision, exclusion settings)

### 5. Item Groups Migration
- **File**: `20250130000005_seed_item_groups/migration.sql`
- **Source**: `scripts/seed.prod.itemGroups.ts`
- **Description**: Seeds item group categories for raw materials, components, and finished goods
- **Data**: 12 item group categories (grain types, enzymes, yeast, barrels, finished goods)

### 6. Milling Bin Configurations Migration
- **File**: `20250130000006_seed_milling_bin_configurations/migration.sql`
- **Source**: `scripts/seed.prod.millingBinConfiguration.ts`
- **Description**: Seeds milling bin configurations linking silos to grain types
- **Data**: 12 configurations (3 silos × 4 grain types)

### 7. ERP Units Migration
- **File**: `20250130000007_seed_erp_units/migration.sql`
- **Source**: `scripts/database/seeding/load-erp-units.ts`
- **Description**: Seeds comprehensive ERP unit definitions with conversion rates
- **Data**: 22 unit definitions across barrel, mass, time, volume, and specialized container units

## Migration Features

All migrations include:
- **Conflict Resolution**: `ON CONFLICT` clauses to handle duplicate data gracefully
- **Schema Versioning**: `schemaVersion` field to track migration source
- **Audit Fields**: Proper `createdAt`, `updatedAt`, `createdBy`, `updatedBy` fields
- **Transaction Safety**: Wrapped in `BEGIN`/`COMMIT` blocks
- **Documentation**: Comments explaining data source and purpose

## Usage

### Running Individual Migrations
```bash
# Run specific migration
npx prisma migrate deploy --name 20250130000001_seed_recipe_parameters

# Run all new migrations
npx prisma migrate deploy
```

### Verification Queries
```sql
-- Check recipe parameters
SELECT COUNT(*) FROM "RecipeParameter" WHERE "schemaVersion" = '20250130000001_seed_recipe_parameters';

-- Check test parameters
SELECT COUNT(*) FROM "TestParameter" WHERE "schemaVersion" = '20250130000002_seed_test_parameters';

-- Check unit links
SELECT COUNT(*) FROM "UnitLookup" WHERE "schemaVersion" = '20250130000003_seed_unit_links';

-- Check enzyme system configs
SELECT COUNT(*) FROM "SystemConfiguration" WHERE "schemaVersion" = '20250130000004_seed_enzyme_system_configs';

-- Check item groups
SELECT COUNT(*) FROM "ItemGroup" WHERE "schemaVersion" = '20250130000005_seed_item_groups';

-- Check milling bin configurations
SELECT COUNT(*) FROM "MillingBinConfiguration" WHERE "schemaVersion" = '20250130000006_seed_milling_bin_configurations';

-- Check ERP units
SELECT COUNT(*) FROM "Unit" WHERE "schemaVersion" = '20250130000007_seed_erp_units';
```

## Dependencies

### Migration Dependencies
- **Milling Bin Configurations**: Requires `Asset` and `ItemGroup` tables to be populated
- **Unit Links**: Requires proper base unit relationships
- **ERP Units**: Self-contained with proper conflict resolution

### Existing Data
These migrations are designed to work with existing data and will:
- Skip duplicate entries using `ON CONFLICT` clauses
- Update existing entries where appropriate
- Maintain referential integrity

## Benefits

1. **Consistency**: Ensures same data across all environments
2. **Automation**: Eliminates manual seeding script execution
3. **Version Control**: Migration files are tracked in Git
4. **Rollback**: Standard Prisma migration rollback capabilities
5. **Documentation**: Clear audit trail of data changes

## Migration Order

The migrations should be run in the following order due to dependencies:
1. Recipe Parameters (independent)
2. Test Parameters (independent)
3. Unit Links (independent)
4. Enzyme System Configurations (independent)
5. Item Groups (independent)
6. Milling Bin Configurations (depends on Item Groups and Assets)
7. ERP Units (independent)

## Notes

- All migrations use `gen_random_uuid()` for ID generation
- Timestamps use `NOW()` for current timestamp
- Schema version field tracks migration source for auditing
- Conflict resolution preserves existing data while updating as needed 