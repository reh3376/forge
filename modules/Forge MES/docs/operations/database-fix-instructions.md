# WhiskeyHouse MES Database Fixes

This document provides instructions for fixing bad data issues identified in the WhiskeyHouse MES database as outlined in `bad-data-analysis.md`.

## Issues Summary

1. **Negative erpId Values**
   - Affected tables: Bom (13 records), Item (25 records), Vendor (1 record)
   - Example: `-20`, `-999`, `-3`

2. **Empty Name Fields**
   - Affected tables: Item (123 records), ProductionOrder (2 records), ScheduleOrder (12 records)
   - Records with empty (`''`, `' '`) or NULL name values

3. **"DELETE ME" Markers**
   - Affected tables: Customer (3 records)
   - Example: `DELETE ME`, `DELETE ME - 2`

## Fix Scripts

We've created the following scripts to address these issues:

### 1. `fix-order-null-names-pg.sql` (PostgreSQL)

Fixes NULL names in ProductionOrder and ScheduleOrder tables by generating consistent identifiers:
- Format: `PROYYYJJJNNN` for ProductionOrder or `SHOYYYJJJNNN` for ScheduleOrder
- Where:
  - `YYY` = Last two digits of year (e.g., 24 for 2024)
  - `JJJ` = Julian day (day of year, e.g., 189 for July 8)
  - `NNN` = Sequential number (001, 002, etc.)

### 2. `fix-order-null-names.sql` (SQL Server)

SQL Server compatible version of the above script.

### 3. `fix-bad-data-issues.sql`

Addresses other bad data issues:
- Replaces negative erpId values with `TEMP_` followed by the positive number
- Fixes empty name fields in Item table 
- Identifies "DELETE ME" markers in Customer table (without deletion)

## Usage Instructions

### For PostgreSQL

1. Make a database backup before running any scripts
   ```
   pg_dump -U your_username -d your_database > pre_fix_backup.sql
   ```

2. Run the fix scripts in this order:
   ```
   psql -U your_username -d your_database -f fix-order-null-names-pg.sql
   psql -U your_username -d your_database -f fix-bad-data-issues.sql
   ```

### For SQL Server

1. Make a database backup before running any scripts
   - Use SQL Server Management Studio backup functionality or
   - Use the `BACKUP DATABASE` T-SQL command

2. Run the fix scripts in this order:
   - Using SSMS: Open and execute each script
   - Using sqlcmd: 
     ```
     sqlcmd -S your_server -d your_database -i fix-order-null-names.sql
     sqlcmd -S your_server -d your_database -i fix-bad-data-issues.sql
     ```

## Important Notes

- Each script contains its own transaction control (BEGIN/COMMIT)
- Every script logs the changes it makes to temporary tables
- If errors occur during execution, the transaction will roll back automatically
- For the "DELETE ME" records in the Customer table, the script only identifies them - you must decide whether to delete them or mark them inactive

## Verification

After running the scripts, you can verify the changes:

1. Check if any NULL names remain:
   ```sql
   SELECT COUNT(*) FROM "ProductionOrder" WHERE name IS NULL;
   SELECT COUNT(*) FROM "ScheduleOrder" WHERE name IS NULL;
   ```

2. Check if any negative erpId values remain:
   ```sql
   SELECT COUNT(*) FROM "Bom" WHERE "erpId" LIKE '-%';
   SELECT COUNT(*) FROM "Item" WHERE "erpId" LIKE '-%';
   SELECT COUNT(*) FROM "Vendor" WHERE "erpId" LIKE '-%';
   ```

3. Check if any empty itemName values remain:
   ```sql
   SELECT COUNT(*) FROM "Item" WHERE "itemName" IN ('', ' ') OR "itemName" IS NULL;
   ```

4. Verify "DELETE ME" records:
   ```sql
   SELECT * FROM "Customer" WHERE name LIKE 'DELETE ME%';
   ```

# BOM Duplicate Migration Instructions

## Overview
This document provides step-by-step instructions for migrating BOM items from duplicate BOM records without ERP IDs to records with ERP IDs, then safely removing the duplicates.

## Problem Summary
- **Total BOMs**: 150
- **Unique BOM Revisions**: 125  
- **Duplicate BOM Revisions**: 25
- **Pattern**: Records with NULL ERP IDs contain the actual BOM items, while records with numeric ERP IDs are empty but represent the "official" records

## Migration Strategy
1. **Keep records with ERP IDs** (they're the official ones)
2. **Migrate BOM items** from NULL ERP ID records to ERP ID records  
3. **Delete NULL ERP ID records** after successful migration

## Files Created
- `check_duplicate_bom_revisions.sql` - Comprehensive analysis script
- `quick_duplicate_bom_check.sql` - Quick summary script
- `bom_duplicate_cleanup_analysis.sql` - Cleanup recommendations
- `bom_duplicate_migration_script.sql` - Analysis and planning script
- `fix-all-bad-data.sql` - **EXECUTABLE migration script**

## Pre-Migration Checklist

### 1. Backup Database
```sql
-- Create backup tables
CREATE TABLE "Bom_backup_20250128" AS SELECT * FROM "Bom";
CREATE TABLE "BomItem_backup_20250128" AS SELECT * FROM "BomItem";
```

### 2. Verify Current State
Run the quick check to confirm current duplicate count:
```sql
\i quick_duplicate_bom_check.sql
```

Expected results:
- Total BOMs: 150
- Unique BOM Revisions: 125
- Duplicate BOM Revisions: 25

### 3. Review Migration Plan
Run the analysis script to see what will be migrated:
```sql
\i bom_duplicate_migration_script.sql
```

## Migration Execution

### Step 1: Run the Migration Script
The `fix-all-bad-data.sql` script contains all the necessary commands:

```sql
\i fix-all-bad-data.sql
```

**Important**: The script includes transaction control. Review the verification results before committing.

### Step 2: Verify Results
The script includes automatic verification that checks:
- Remaining duplicates (should be 0)
- Orphaned BOM items (should be 0)  
- Final BOM count (should be 125 total, 125 unique revisions)

### Step 3: Commit or Rollback
If verification passes:
```sql
COMMIT;
```

If there are issues:
```sql
ROLLBACK;
```

## What Gets Migrated

The migration will affect **17 BOM revisions** with **225 total BOM items**:

| BOM Revision | Items to Migrate | From (NULL ERP) | To (ERP ID) |
|--------------|------------------|-----------------|-------------|
| BOM-BGL-70-21-00-09-R01 | 12 items | BOM-BGL-70-21-00-09 | 99 (ERP: 126) |
| BOM-BRL-73-18-00-09-R01 | 12 items | BOM-BRL-73-18-00-09 | 84 (ERP: 108) |
| BOM-CBI-00-95-00-05-R01 | 12 items | BOM-CBI-00-95-00-05 | 79 (ERP: 103) |
| BOM-DBC-52-00-36-12-R01 | 14 items | BOM-DBC-52-00-36-12 | 58 (ERP: 61) |
| BOM-DGI-60-36-00-04-R01 | 12 items | BOM-DGI-60-36-00-04 | 73 (ERP: 76) |
| BOM-EJG-74-18-00-08-R01 | 11 items | BOM-EJG-74-18-00-08 | 101 (ERP: 128) |
| BOM-JBM-51-00-40-09-R01 | 15 items | BOM-JBM-51-00-40-09 | 76 (ERP: 79) |
| BOM-OCD-64-00-24-12-R01 | 13 items | BOM-OCD-64-00-24-12 | 92 (ERP: 119) |
| BOM-PAW-00-95-00-05-R01 | 16 items | BOM-PAW-00-95-00-05 | 68 (ERP: 71) |
| BOM-PAW-60-36-00-04-R01 | 17 items | BOM-PAW-60-36-00-04 | 70 (ERP: 73) |
| BOM-PAW-65-15-12-08-R01 | 13 items | BOM-PAW-65-15-12-08 | 87 (ERP: 114) |
| BOM-PAW-75-21-00-04-R01 | 16 items | BOM-PAW-75-21-00-04 | 65 (ERP: 68) |
| BOM-SBL-64-24-00-12-R01 | 13 items | BOM-SBL-64-24-00-12 | 96 (ERP: 123) |
| BOM-SBL-70-21-00-09-R01 | 12 items | BOM-SBL-70-21-00-09 | 94 (ERP: 121) |
| BOM-WSC-74-18-00-08-R01 | 13 items | BOM-WSC-74-18-00-08 | 100 (ERP: 127) |
| BOM-WTS-60-00-36-04-R01 | 13 items | BOM-WTS-60-00-36-04 | 82 (ERP: 106) |
| BOM-WTS-60-36-00-04-R01 | 14 items | BOM-WTS-60-36-00-04 | 80 (ERP: 104) |

## Special Cases Handled

### Multiple ERP ID Records
Some BOM revisions have multiple records with ERP IDs. These require manual review:
- `BOM-FDP-78-10-00-12-R01` (2 ERP records: -20, 38)
- `BOM-GSC-00-95-00-05-R01` (2 ERP records: -27, 45)  
- `BOM-LQD-60-00-36-04-R01` (2 ERP records: -15, 33)
- `BOM-LQD-75-21-00-04-R01` (2 ERP records: -13, 29)
- `BOM-LSS-73-18-00-09-R01` (2 ERP records: -22, 42)
- `BOM-OTS-75-21-00-04-R01` (2 ERP records: -23, 40)
- `BOM-OTS-80-10-00-10-R01` (2 ERP records: -24, 41)
- `BOM-WHK-75-21-00-04-R01` (2 ERP records: 46, 56)

These cases are **not included** in the automated migration and need manual resolution.

## Post-Migration Verification

After successful migration, run these queries to confirm:

```sql
-- Should return 0 duplicates
SELECT "bomRevision", COUNT(*) 
FROM "Bom" 
GROUP BY "bomRevision" 
HAVING COUNT(*) > 1;

-- Should return 0 orphaned items
SELECT COUNT(*) 
FROM "BomItem" bi 
LEFT JOIN "Bom" b ON bi."bomId" = b.id 
WHERE b.id IS NULL;

-- Should show 125 total BOMs, 125 unique revisions
SELECT COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions 
FROM "Bom";
```

## Rollback Plan

If issues are discovered after migration:

1. **If transaction is still open**: `ROLLBACK;`
2. **If transaction was committed**: Restore from backup tables:
   ```sql
   BEGIN;
   DELETE FROM "BomItem";
   DELETE FROM "Bom";
   INSERT INTO "Bom" SELECT * FROM "Bom_backup_20250128";
   INSERT INTO "BomItem" SELECT * FROM "BomItem_backup_20250128";
   COMMIT;
   ```

## Cleanup After Successful Migration

Once migration is verified successful, you can remove backup tables:
```sql
DROP TABLE "Bom_backup_20250128";
DROP TABLE "BomItem_backup_20250128";
```

## Contact Information

For questions or issues during migration:
- Database Administrator
- Development Team Lead
- System Administrator

## Migration Log

- **Planned Date**: [To be filled]
- **Executed By**: [To be filled]  
- **Start Time**: [To be filled]
- **End Time**: [To be filled]
- **Status**: [To be filled]
- **Issues Encountered**: [To be filled]
- **Resolution**: [To be filled] 