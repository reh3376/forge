# Database Migration Scripts for Prisma Migration Fix

This directory contains the migration scripts needed to resolve data quality issues preventing the Prisma migration from completing successfully.

## Problem Summary

The Prisma migration was failing due to:
1. **Duplicate `bomRevision` values** in the `Bom` table (40 duplicate groups with 65 extra records)
2. **Duplicate `Recipe` names** in the `Recipe` table (preventing unique constraint creation)
3. **Data quality issues** including TEMP_ prefixes, RUN# prefixes, DELETE markers, and negative names

## Correct Execution Order

**IMPORTANT**: Execute these scripts in the exact order listed below. Each script includes transaction control with manual COMMIT/ROLLBACK for safety.

### Phase 1: Initial Cleanup (Scripts 01-04)
These scripts handle the basic data quality issues and some specific duplicate cases:

#### 1. `01-backup-tables.sql`
- Creates safety backups of critical tables
- **Status**: ✅ Executed successfully

#### 2. `02-migrate-bom-items.sql` 
- Migrates BOM items and ProductionOrders from 5 specific duplicate BOM cases
- **Status**: ✅ Executed successfully (handled 5 specific cases only)

#### 3. `03-delete-duplicate-boms.sql`
- Deletes the empty duplicate BOM records after migration
- **Status**: ✅ Executed successfully (deleted 5 specific duplicates only)

#### 4. `04-cleanup-bad-data-simple.sql`
- Comprehensive cleanup of data quality issues
- Fixes TEMP_ prefixes, RUN# prefixes, DELETE markers, negative names
- **Status**: ✅ Executed successfully (resolved all data quality issues)

### Phase 2: Assessment (Script 05)

#### 5. `05-verification-before-comprehensive-fix.sql`
- **Verification only** - does NOT run Prisma migration
- Assesses remaining duplicate issues after initial cleanup
- **Expected Result**: Will show that comprehensive duplicate resolution is needed
- **Status**: ⚠️ Reveals that 40 duplicate BOM groups and Recipe duplicates remain

### Phase 3: Comprehensive Resolution (Scripts 06-07)

#### 6. `06-comprehensive-duplicate-resolution.sql` ⭐ **COMPREHENSIVE SOLUTION**
- **Complete resolution** of ALL duplicate bomRevisions and Recipe names
- Handles all 40 duplicate BOM groups (not just the initial 5)
- Resolves Recipe name duplicates using trigger management
- **Status**: ✅ Executed successfully - **THIS IS THE ACTUAL WORKING SOLUTION**

#### 7. `07-final-verification.sql`
- Final verification that all issues are resolved
- Confirms database is ready for Prisma migration
- **Expected Result**: All checks should pass
- **Status**: ✅ Confirms database is ready

### Phase 4: Migration (Script 08)

#### 8. `08-run-prisma-migration.sql`
- Final pre-migration verification
- Instructions for running `npx prisma migrate deploy`
- Post-migration verification queries
- **Status**: ✅ Migration completed successfully

## Script Flow Explanation

### Why This Order Matters

1. **Scripts 01-04**: Handle "easy" data quality issues and some obvious duplicates
2. **Script 05**: Reveals that the problem is much bigger than initially thought
3. **Scripts 06-07**: Implement the comprehensive solution for all remaining issues
4. **Script 08**: Actually runs the Prisma migration

### Original vs. Comprehensive Approach

**Original Approach (Scripts 02-03):**
- Only handled 5 specific duplicate BOM cases
- Missed 35 other duplicate groups
- Didn't address Recipe duplicates at all

**Comprehensive Approach (Script 06):**
- Systematic resolution of ALL 40 duplicate BOM groups
- Complete Recipe duplicate resolution across 8+ tables
- Proper trigger management for protected tables

## Key Learnings

### Why the Initial Approach Was Insufficient
- **Scope underestimation**: Only 5 duplicate cases were identified initially
- **Hidden complexity**: Recipe duplicates weren't discovered until Prisma migration attempt
- **Trigger complications**: Lot table had protection triggers requiring special handling

### Comprehensive Solution Strategy
Script 06 implements a systematic approach:

**For BOM Duplicates:**
1. **Priority-based consolidation**: Keep BOMs with positive erpIds over negative/null erpIds
2. **Data preservation**: Migrate all BOM items and ProductionOrders to the "best" BOM
3. **Clean deletion**: Remove duplicate BOMs only after all references are migrated

**For Recipe Duplicates:**
1. **Recency-based consolidation**: Keep the most recent Recipe (by createdAt)
2. **Reference migration**: Update all foreign key references across 8+ tables
3. **Trigger management**: Temporarily disable Lot table protection triggers
4. **Relationship preservation**: Handle many-to-many relationship tables

## Final Results

After executing the complete script sequence:
- ✅ **0 duplicate BOM revisions** (down from 40 groups)
- ✅ **0 duplicate Recipe names** (resolved all duplicates)
- ✅ **0 orphaned BOM items** (down from 43)
- ✅ **0 data quality issues** (all TEMP_, RUN#, DELETE markers resolved)
- ✅ **Prisma migration completed successfully**

## Rollback Procedures

Each script uses transactions with manual COMMIT/ROLLBACK control:

1. **Review verification queries** at the end of each script
2. **If results look correct**: Run `COMMIT;`
3. **If there are issues**: Run `ROLLBACK;`

### Emergency Rollback
If you need to restore from backups (created by script 01):
```sql
-- Restore Bom table
DROP TABLE "Bom";
ALTER TABLE "Bom_backup_YYYYMMDD" RENAME TO "Bom";

-- Restore BomItem table  
DROP TABLE "BomItem";
ALTER TABLE "BomItem_backup_YYYYMMDD" RENAME TO "BomItem";
```

## Execution Summary

For someone starting fresh, the complete execution sequence is:

```bash
# Phase 1: Initial cleanup
# Run scripts 01-04 in order

# Phase 2: Assessment  
# Run script 05 (will show remaining issues)

# Phase 3: Comprehensive resolution
# Run script 06 (comprehensive duplicate resolution)
# Run script 07 (final verification)

# Phase 4: Migration
# Run script 08 verification
# Then: npx prisma migrate deploy
```

## Production Database Update Procedure

### Prerequisites
- Database backup completed
- Maintenance window scheduled
- All scripts tested in staging environment

### Execution Checklist
- [ ] Backup critical tables (script 01)
- [ ] Run initial cleanup (scripts 02-04)
- [ ] Assess remaining issues (script 05)
- [ ] Apply comprehensive resolution (script 06)
- [ ] Verify all issues resolved (script 07)
- [ ] Execute Prisma migration (script 08)
- [ ] Verify application functionality

### Risk Mitigation
- All scripts use transactions with manual commit control
- Comprehensive verification at each step
- Backup tables available for emergency rollback
- Staged approach allows stopping at any point

## Notes

- **Script 06 is the key breakthrough** - it handles the comprehensive solution
- **Scripts 02-03 were necessary stepping stones** but insufficient alone
- **The process preserved all data** while resolving constraint violations
- **Total execution time**: ~10-15 minutes for the complete sequence 