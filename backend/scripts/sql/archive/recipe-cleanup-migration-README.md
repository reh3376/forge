# Recipe and BOM Cleanup Migration

This migration handles bad and duplicate recipe and BOM records in the WhiskeyHouse MES database, specifically targeting records with "RUN" or "DEL" in their names or revisions. The major update fixes the root cause of these issues, but these scripts help clean up existing problematic records.

## Migration Actions

The migration performs the following actions in this order:

### 1. Dependency Migration

1. Maps problematic records to their legitimate counterparts
2. Creates fallback mappings for any problematic records without clear counterparts
3. Migrates all foreign key dependencies from problematic records to their legitimate versions
   - Updates Batch, Lot, ProductionOrder and other tables pointing to problematic recipes
   - Updates ProductionOrder, UnitProcedure and other tables pointing to problematic BOMs
   - Handles self-referencing foreign keys

### 2. Recipe Cleanup

1. Removes junction table links for recipes with "RUN" prefix or "DEL"/"DELETE" in their names
2. Deletes all problematic recipes (both "RUN" and "DEL"/"DELETE" recipes)

### 3. BOM Cleanup

1. Deletes BOM items associated with problematic BOMs (both "RUN" and "DEL"/"DELETE" BOMs)
2. Deletes all problematic BOMs (with safe mode protection)

## Execution Options

### Option 1: Using the Node.js Script (Recommended)

The Node.js script provides proper transaction control, detailed logging, and verification steps:

```bash
# From the project root directory
cd scripts
node recipeCleanupMigration.js
```

Command-line options:

- `--sql`: Use the SQL file instead of direct JS implementation
- `--debug`: Enable detailed logging of SQL queries
- `--force`: Disable safe mode and attempt to delete all problematic BOMs (use with caution)

Example:

```bash
# Use SQL file with debug logging
node recipeCleanupMigration.js --sql --debug

# Force deletion of all problematic BOMs even if they have references (dangerous)
node recipeCleanupMigration.js --force
```

### Option 2: Using Raw SQL in PostgreSQL Client

You can execute the SQL script directly in a PostgreSQL client:

```bash
psql -U mes -d whk-mes -f recipe-cleanup-migration.sql
```

## Implementation Details

This migration is provided in two formats with identical functionality:

1. **Node.js Implementation** (`recipeCleanupMigration.js`):

   - Provides detailed logging and progress reporting
   - Handles transactions with automatic rollback on failure
   - Includes verification steps to ensure success
   - Features safe mode to prevent foreign key violations
   - Can optionally execute the SQL file with proper transaction handling

2. **SQL Implementation** (`recipe-cleanup-migration.sql`):
   - Pure SQL implementation for PostgreSQL
   - Includes temporary tables for mapping records
   - Creates fallback mappings for orphaned records
   - Wraps all operations in a transaction
   - Includes verification at the end

Both implementations ensure all foreign key dependencies are properly migrated before removing problematic records.

## Safe Mode (Default)

By default, the migration runs in "safe mode" which:

- Prevents deletion of BOMs that still have foreign key references
- Creates fallback mappings for any problematic records without clear counterparts
- Reports any records that couldn't be safely deleted
- Ensures no foreign key constraint violations can occur

To disable safe mode and force deletion of all problematic BOMs (dangerous), use the `--force` flag:

```bash
node recipeCleanupMigration.js --force
```

## Important Notes

- Always back up your database before running this migration
- Both implementations run within a transaction, so they either complete fully or roll back entirely
- Foreign key dependencies are properly migrated to legitimate records before deletion
- If verification fails, the entire transaction is rolled back
- This script is meant to be run once and is not idempotent
- In safe mode, some problematic BOMs may remain if they have foreign key references that couldn't be migrated

## Handling Foreign Key Violations

If you encounter an error like:

```
[23503] ERROR: update or delete on table "Bom" violates foreign key constraint "ProductionOrder_bomId_fkey" on table "ProductionOrder"
```

This indicates that a BOM you're trying to delete is still referenced by another record. The migration now includes:

1. Pre-migration check to identify orphaned references
2. Fallback mapping creation for orphaned references
3. Safe mode to prevent deletion of BOMs with existing references
4. Detailed reporting of records that couldn't be safely deleted

## Verification

After running the migration, you can verify the results by checking for any remaining records with "RUN" or "DEL" patterns:

```sql
-- Check for remaining recipes with RUN or DEL
SELECT * FROM "Recipe" WHERE "Recipe" LIKE '%RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%';

-- Check for remaining BOMs with RUN or DEL
SELECT * FROM "Bom" WHERE "bomRevision" LIKE '%RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%';

-- Check for BOMs with foreign key references
SELECT
  b.id,
  b."bomName",
  b."bomRevision",
  'ProductionOrder' as referenced_by
FROM "Bom" b
JOIN "ProductionOrder" po ON po."bomId" = b.id
WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%';
```

In safe mode, some problematic BOMs may remain if they still have foreign key references that couldn't be migrated.
