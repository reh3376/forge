# BOM Duplicate Revision Check Scripts

This directory contains SQL scripts to identify and analyze duplicate BOM revisions in the PostgreSQL database.

## Scripts Overview

### 1. `check_duplicate_bom_revisions.sql` - Comprehensive Analysis
**Purpose**: Complete analysis of duplicate BOM revisions across both `Bom` and `RecipeBom` tables.

**What it checks**:
- Duplicate `bomRevision` values in the `Bom` table
- Duplicate `revision` values in the `RecipeBom` table  
- Cross-table revision conflicts between both tables
- Detailed analysis with item information
- Summary statistics
- Data integrity issues (NULL/empty revisions)

**Use when**: You need a thorough analysis of all duplicate issues.

### 2. `quick_duplicate_bom_check.sql` - Quick Summary
**Purpose**: Fast overview of duplicate BOM revisions.

**What it shows**:
- Summary counts (total BOMs, unique revisions, duplicates)
- List of all duplicate revisions with basic info
- Top 10 most problematic duplicates

**Use when**: You need a quick status check or overview.

### 3. `bom_duplicate_cleanup_analysis.sql` - Cleanup Recommendations
**Purpose**: Provides actionable recommendations for cleaning up duplicates.

**What it provides**:
- Recommendations based on creation dates (keep newest)
- Recommendations based on active/inactive status
- Summary of cleanup actions needed
- Generated DELETE statements for safe removal
- Items that might need attention

**Use when**: You're ready to clean up duplicates and need guidance.

## Current Database Status

Based on the latest analysis:
- **Total BOMs**: 150
- **Unique BOM Revisions**: 125  
- **Duplicate BOM Revisions**: 25
- **RecipeBOM Duplicates**: 0 (no duplicates found)

## How to Use

### Step 1: Quick Assessment
```sql
-- Run the quick check to get an overview
\i quick_duplicate_bom_check.sql
```

### Step 2: Detailed Analysis
```sql
-- Run comprehensive analysis for full details
\i check_duplicate_bom_revisions.sql
```

### Step 3: Cleanup Planning
```sql
-- Get cleanup recommendations
\i bom_duplicate_cleanup_analysis.sql
```

## Common Duplicate Patterns Found

1. **Same revision, different creation dates**: Most duplicates appear to be the same BOM created at different times
2. **All duplicates are active**: No inactive duplicates found, suggesting all are potentially valid
3. **Date spans vary**: Some duplicates were created days apart, others months apart

## Cleanup Strategy Recommendations

### Safe Cleanup Approach:
1. **Keep the newest version** of each duplicate revision (most recent `createdAt`)
2. **Verify no dependencies** exist before deleting older versions
3. **Check BOM items** to ensure no data loss
4. **Backup before deletion**

### Example Cleanup Process:
```sql
-- 1. Backup the Bom table
CREATE TABLE "Bom_backup_YYYYMMDD" AS SELECT * FROM "Bom";

-- 2. Use the generated DELETE statements from cleanup analysis script
-- (Review each statement before execution)

-- 3. Verify results
SELECT COUNT(*) FROM "Bom";
SELECT COUNT(DISTINCT "bomRevision") FROM "Bom";
```

## Important Notes

⚠️ **Before running any DELETE operations**:
- Always backup your data
- Check for foreign key dependencies
- Verify the BOM items and related data won't be affected
- Test on a development environment first

🔍 **Key fields to consider**:
- `bomRevision`: The field with duplicates
- `createdAt`: Use to determine which version to keep
- `inactive`: Prefer active versions over inactive ones
- `bomName`: May help identify the purpose of each BOM

## Dependencies to Check

Before deleting any BOM records, verify these tables don't reference them:
- `BomItem` (via foreign keys)
- `ProductionOrder` (if any BOM references exist)
- `RecipeBom` (check for any relationships)

## Contact

If you need assistance with the cleanup process or have questions about the analysis, please consult with the database administrator or development team. 