-- =====================================================
-- BOM Duplicate Migration Script
-- =====================================================
-- This script migrates BOM items from duplicate BOM records
-- without ERP IDs to records with ERP IDs, then removes duplicates
-- =====================================================

-- IMPORTANT: Run this script in a transaction and test thoroughly!
-- BEGIN; -- Uncomment to start transaction

-- =====================================================
-- STEP 1: Analysis - Identify migration pairs
-- =====================================================
WITH duplicate_pairs AS (
    SELECT 
        b."bomRevision",
        b.id as bom_id,
        b."erpId",
        b."bomName",
        b."createdAt",
        CASE 
            WHEN b."erpId" IS NULL THEN 'SOURCE'
            ELSE 'TARGET'
        END as migration_role,
        COUNT(bi.id) as bom_items_count
    FROM "Bom" b
    LEFT JOIN "BomItem" bi ON b.id = bi."bomId"
    WHERE b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
    GROUP BY b."bomRevision", b.id, b."erpId", b."bomName", b."createdAt"
),
migration_plan AS (
    SELECT 
        dp1."bomRevision",
        dp1.bom_id as source_bom_id,
        dp1."bomName" as source_bom_name,
        dp1.bom_items_count as items_to_migrate,
        dp2.bom_id as target_bom_id,
        dp2."erpId" as target_erp_id,
        dp2."bomName" as target_bom_name
    FROM duplicate_pairs dp1
    JOIN duplicate_pairs dp2 ON dp1."bomRevision" = dp2."bomRevision"
    WHERE dp1.migration_role = 'SOURCE' 
    AND dp2.migration_role = 'TARGET'
    AND dp1.bom_items_count > 0
)
SELECT 
    'MIGRATION PLAN' as step,
    "bomRevision",
    source_bom_id,
    source_bom_name,
    items_to_migrate,
    target_bom_id,
    target_erp_id,
    target_bom_name,
    'Migrate ' || items_to_migrate || ' items from ' || source_bom_name || ' to ' || target_bom_name as action
FROM migration_plan
ORDER BY "bomRevision";

-- =====================================================
-- STEP 2: Generate UPDATE statements for BomItem migration
-- =====================================================
WITH migration_pairs AS (
    SELECT 
        b1.id as source_bom_id,
        b1."bomRevision",
        b1."bomName" as source_name,
        b2.id as target_bom_id,
        b2."erpId" as target_erp_id,
        b2."bomName" as target_name
    FROM "Bom" b1
    JOIN "Bom" b2 ON b1."bomRevision" = b2."bomRevision"
    WHERE b1."erpId" IS NULL 
    AND b2."erpId" IS NOT NULL
    AND b1."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
)
SELECT 
    'BOMITEM MIGRATION STATEMENTS' as step,
    mp."bomRevision",
    'UPDATE "BomItem" SET "bomId" = ''' || mp.target_bom_id || ''' WHERE "bomId" = ''' || mp.source_bom_id || '''; -- ' ||
    'Migrate ' || COUNT(bi.id) || ' items from ' || mp.source_name || ' to ' || mp.target_name || ' (ERP: ' || mp.target_erp_id || ')' as update_statement
FROM migration_pairs mp
LEFT JOIN "BomItem" bi ON mp.source_bom_id = bi."bomId"
GROUP BY mp."bomRevision", mp.source_bom_id, mp.target_bom_id, mp.target_erp_id, mp.source_name, mp.target_name
HAVING COUNT(bi.id) > 0
ORDER BY mp."bomRevision";

-- =====================================================
-- STEP 3: Generate DELETE statements for source BOM records
-- =====================================================
WITH records_to_delete AS (
    SELECT 
        b.id as bom_id,
        b."bomRevision",
        b."bomName",
        b."erpId",
        COUNT(bi.id) as current_bom_items
    FROM "Bom" b
    LEFT JOIN "BomItem" bi ON b.id = bi."bomId"
    WHERE b."erpId" IS NULL 
    AND b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
    GROUP BY b.id, b."bomRevision", b."bomName", b."erpId"
)
SELECT 
    'DELETE STATEMENTS' as step,
    "bomRevision",
    'DELETE FROM "Bom" WHERE id = ''' || bom_id || '''; -- ' ||
    'Remove ' || "bomName" || ' (had ' || current_bom_items || ' items before migration)' as delete_statement
FROM records_to_delete
ORDER BY "bomRevision";

-- =====================================================
-- STEP 4: Verification queries (run AFTER migration)
-- =====================================================
SELECT 
    'VERIFICATION QUERIES' as step,
    'Run these queries AFTER migration to verify success:' as instruction,
    '' as query
UNION ALL
SELECT 
    'VERIFICATION QUERIES' as step,
    'Check remaining duplicates:' as instruction,
    'SELECT "bomRevision", COUNT(*) FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1;' as query
UNION ALL
SELECT 
    'VERIFICATION QUERIES' as step,
    'Check BOM items without valid BOM:' as instruction,
    'SELECT COUNT(*) FROM "BomItem" bi LEFT JOIN "Bom" b ON bi."bomId" = b.id WHERE b.id IS NULL;' as query
UNION ALL
SELECT 
    'VERIFICATION QUERIES' as step,
    'Check final BOM count:' as instruction,
    'SELECT COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions FROM "Bom";' as query;

-- =====================================================
-- STEP 5: Backup recommendations
-- =====================================================
SELECT 
    'BACKUP RECOMMENDATIONS' as step,
    'Create backups before running migration:' as instruction,
    '' as backup_command
UNION ALL
SELECT 
    'BACKUP RECOMMENDATIONS' as step,
    'Backup Bom table:' as instruction,
    'CREATE TABLE "Bom_backup_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '" AS SELECT * FROM "Bom";' as backup_command
UNION ALL
SELECT 
    'BACKUP RECOMMENDATIONS' as step,
    'Backup BomItem table:' as instruction,
    'CREATE TABLE "BomItem_backup_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '" AS SELECT * FROM "BomItem";' as backup_command;

-- =====================================================
-- STEP 6: Special cases analysis
-- =====================================================
WITH special_cases AS (
    SELECT 
        b."bomRevision",
        COUNT(*) as total_records,
        COUNT(CASE WHEN b."erpId" IS NULL THEN 1 END) as null_erp_count,
        COUNT(CASE WHEN b."erpId" IS NOT NULL THEN 1 END) as has_erp_count,
        STRING_AGG(DISTINCT CASE WHEN b."erpId" IS NOT NULL THEN b."erpId" END, ', ') as erp_ids
    FROM "Bom" b
    WHERE b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
    GROUP BY b."bomRevision"
)
SELECT 
    'SPECIAL CASES' as step,
    "bomRevision",
    total_records,
    null_erp_count,
    has_erp_count,
    erp_ids,
    CASE 
        WHEN has_erp_count = 0 THEN 'ERROR: No ERP ID records found'
        WHEN has_erp_count > 1 THEN 'WARNING: Multiple ERP ID records - manual review needed'
        WHEN null_erp_count = 0 THEN 'INFO: No NULL ERP records to migrate'
        ELSE 'OK: Standard migration case'
    END as status
FROM special_cases
ORDER BY 
    CASE 
        WHEN has_erp_count = 0 THEN 1
        WHEN has_erp_count > 1 THEN 2
        ELSE 3
    END,
    "bomRevision";

-- =====================================================
-- EXECUTION TEMPLATE
-- =====================================================
/*
RECOMMENDED EXECUTION ORDER:

1. Review the MIGRATION PLAN and SPECIAL CASES sections above
2. Create backups using the BACKUP RECOMMENDATIONS
3. Start a transaction: BEGIN;
4. Execute the UPDATE statements from BOMITEM MIGRATION STATEMENTS
5. Execute the DELETE statements from DELETE STATEMENTS  
6. Run the VERIFICATION QUERIES to confirm success
7. If everything looks good: COMMIT;
8. If there are issues: ROLLBACK;

EXAMPLE EXECUTION:
BEGIN;

-- Execute all UPDATE statements (copy from BOMITEM MIGRATION STATEMENTS section)
UPDATE "BomItem" SET "bomId" = 'target_id' WHERE "bomId" = 'source_id';
-- ... repeat for all migration pairs

-- Execute all DELETE statements (copy from DELETE STATEMENTS section)  
DELETE FROM "Bom" WHERE id = 'source_id';
-- ... repeat for all records to delete

-- Verify results
SELECT "bomRevision", COUNT(*) FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1;

-- If results look good:
COMMIT;
-- If there are problems:
-- ROLLBACK;
*/ 