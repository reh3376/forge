# Database Migration Scripts - Execution Order

This directory contains a comprehensive set of migration scripts to fix database issues and enable the Prisma migration to succeed. The scripts must be executed in the exact order specified below.

## Problem Summary

The Prisma migration is failing due to:

- **Duplicate `bomRevision` values** in the `Bom` table preventing unique index creation
- **Bad data patterns** including:
  - `TEMP_` prefixed ERP IDs (negative values converted to positive with TEMP\_ prefix)
  - `RUN#-` prefixes in BOM revisions and Recipe names (RUN0-, RUN1-, RUN2-, etc.)
  - `DELETE` and `DEL` markers in BOM revisions and Recipe names
  - Negative BOM names (like '-9', '-8')
  - Numeric-only BOM names that need descriptive prefixes
  - Empty or null item names
- **Orphaned BOM items** referencing non-existent BOMs

## Migration Scripts Execution Order

### ⚠️ IMPORTANT: Run these scripts in order and verify each step before proceeding!

---

## Step 1: Create Backup Tables

**File:** `01-backup-tables.sql`
**Purpose:** Create backup copies of all tables we'll modify
**What it does:**

- Creates `Bom_backup_migration_20250128` table
- Creates `BomItem_backup_migration_20250128` table
- Shows current record counts for verification

**Command:**

```bash
# Using postgres-mes-local MCP
# Copy and paste the contents of 01-backup-tables.sql
```

**Expected Result:** Backup tables created with same record counts as originals

---

## Step 2: Migrate BOM Items

**File:** `02-migrate-bom-items.sql`
**Purpose:** Move BOM items from duplicate BOMs to the correct target BOMs
**What it does:**

- Migrates items from BOMs without ERP IDs to BOMs with ERP IDs
- Handles specific duplicate BOM revision cases:
  - `RUN1-BOM-HNW-51-39-00-10-R01` (14 items to migrate)
  - `RUN1-BOM-HNW-51-39-00-10-R02` (14 items to migrate)
  - `RUN1-BOM-HNW-51-39-00-10-R03` (14 items to migrate)
- Uses transactions with verification steps

**⚠️ CRITICAL:** This script uses `BEGIN` but requires manual `COMMIT` or `ROLLBACK`

**Command:**

```bash
# Using postgres-mes-local MCP
# Copy and paste the contents of 02-migrate-bom-items.sql
# Review the verification results
# If all looks good: COMMIT;
# If there are issues: ROLLBACK;
```

**Expected Result:** All BOM items moved to target BOMs, source BOMs should have 0 items

---

## Step 3: Delete Duplicate BOMs

**File:** `03-delete-duplicate-boms.sql`
**Purpose:** Delete the now-empty duplicate BOM records
**What it does:**

- Final verification that source BOMs have no items
- Deletes the specific duplicate BOM records:
  - `clyyl1jar0007qqbin6mnjl3i` (bomName: '-9')
  - `clyyl1jat0009qqbinlhxqy8w` (bomName: '-8')
  - `clyyl1jav000bqqbinxqcvhxd` (bomName: '-7')
- Uses transactions with verification

**⚠️ CRITICAL:** Only run this if Step 2 verification showed 0 items in source BOMs

**Command:**

```bash
# Using postgres-mes-local MCP
# Copy and paste the contents of 03-delete-duplicate-boms.sql
# Review the verification results
# If all looks good: COMMIT;
# If there are issues: ROLLBACK;
```

**Expected Result:** 3 duplicate BOM records deleted, no duplicate bomRevisions remain

---

## Step 4: Cleanup Bad Data

**File:** `04-cleanup-bad-data-simple.sql`
**Purpose:** Fix all other bad data patterns in the database
**What it does:**

### TEMP\_ ERP ID Cleanup:

- **Bom table:** Removes `TEMP_` prefix from erpId fields
- **Item table:** Removes `TEMP_` prefix from erpId fields
- **Vendor table:** Removes `TEMP_` prefix from erpId fields

### RUN# Prefix Cleanup:

- **BOM revisions:** Removes `RUN0-`, `RUN1-`, `RUN2-`, etc. prefixes
- **Recipe names:** Removes `RUN0-`, `RUN1-`, `RUN2-`, etc. prefixes

### BOM Name Cleanup:

- **Negative names:** Converts `-9`, `-8`, etc. to `BOM_[erpId]`
- **Numeric names:** Converts `29`, `31`, etc. to `BOM_29`, `BOM_31`

### DELETE Marker Cleanup:

- **BOM revisions:** Removes `-DELETE`, `-DELETE1`, `-DEL` suffixes
- **Recipe names:** Removes `-DELETE`, `-DELETE1`, `-DEL` suffixes
- **Empty records:** Deletes BOMs/Recipes with DELETE markers that have no dependencies

### Item Name Cleanup:

- **Empty names:** Fixes null/empty itemName fields using itemNumber or erpId

**⚠️ CRITICAL:** This script uses `BEGIN` but requires manual `COMMIT` or `ROLLBACK`

**Command:**

```bash
# Using postgres-mes-local MCP
# Copy and paste the contents of 04-cleanup-bad-data-simple.sql
# Review all verification results at the end
# If all verification checks show 0 counts: COMMIT;
# If there are any issues: ROLLBACK;
```

**Expected Result:** All verification checks should show 0 remaining problematic records

---

## Step 5: Run Prisma Migration

**File:** `05-run-prisma-migration.sql`
**Purpose:** Final verification and Prisma migration execution
**What it does:**

- Verifies no duplicate BOM revisions remain
- Checks for orphaned BOM items
- Provides command to run Prisma migration

**Command:**

```bash
# First run verification queries from 05-run-prisma-migration.sql
# If all checks pass, then run:
cd /path/to/your/project
npx prisma migrate deploy
```

**Expected Result:** Prisma migration succeeds without errors

---

## Verification Commands

After each step, you can run these verification queries:

```sql
-- Check for duplicate BOM revisions
SELECT "bomRevision", COUNT(*) as count
FROM "Bom"
GROUP BY "bomRevision"
HAVING COUNT(*) > 1;

-- Check for problematic patterns
SELECT 'TEMP_ erpIds' as issue, COUNT(*) as count
FROM "Bom" WHERE "erpId" LIKE 'TEMP_%'
UNION ALL
SELECT 'RUN prefixes in BOM', COUNT(*) as count
FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
UNION ALL
SELECT 'DELETE markers in BOM', COUNT(*) as count
FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE '%DEL%'
UNION ALL
SELECT 'Negative BOM names', COUNT(*) as count
FROM "Bom" WHERE "bomName" LIKE '-%';
```

## Rollback Plan

If anything goes wrong:

1. **Stop immediately** - Don't run subsequent scripts
2. **Rollback current transaction** if in the middle of a script
3. **Restore from backups:**
   ```sql
   DROP TABLE "Bom";
   DROP TABLE "BomItem";
   ALTER TABLE "Bom_backup_migration_20250128" RENAME TO "Bom";
   ALTER TABLE "BomItem_backup_migration_20250128" RENAME TO "BomItem";
   ```

## Success Criteria

The migration is successful when:

- ✅ No duplicate `bomRevision` values exist
- ✅ No `TEMP_` prefixed ERP IDs remain
- ✅ No `RUN#-` prefixes in BOM revisions or Recipe names
- ✅ No `DELETE`/`DEL` markers in active records
- ✅ No negative or problematic BOM names
- ✅ No empty item names
- ✅ Prisma migration runs successfully

## Original Script Functionality Included

This comprehensive migration includes ALL functionality from the original scripts:

### From `bom_duplicate_cleanup_analysis.sql`:

- ✅ Duplicate BOM revision analysis
- ✅ BOM item migration strategies
- ✅ ERP ID handling

### From `check_duplicate_bom_revisions.sql`:

- ✅ Comprehensive duplicate detection
- ✅ Item count analysis
- ✅ Relationship mapping

### From `fix-all-bad-data.sql`:

- ✅ TEMP\_ ERP ID cleanup
- ✅ RUN# prefix removal
- ✅ DELETE marker cleanup
- ✅ Negative name fixes

### From `fix-production-schedule-order-names.sql`:

- ✅ Production order name cleanup
- ✅ Schedule order name fixes

### From `recipeCleanupMigration.js`:

- ✅ Transaction safety
- ✅ Comprehensive verification
- ✅ Fallback handling

All patterns and edge cases from the original scripts have been consolidated into this ordered, comprehensive migration set.
