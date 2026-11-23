-- =====================================================
-- 05-verification-before-comprehensive-fix.sql
-- =====================================================
-- This script verifies the current state after the initial cleanup
-- and identifies remaining issues that need comprehensive resolution.
--
-- DO NOT run Prisma migration yet - this will reveal remaining duplicates
-- that need to be fixed by script 06.
--
-- Execution: Run this script to assess remaining issues
-- =====================================================

-- Check 1: Verify BOM duplicates status
SELECT 
    'BOM Duplicates Check' as check_type,
    COUNT(*) as duplicate_groups,
    SUM(duplicate_count - 1) as extra_records
FROM (
    SELECT 
        "bomRevision",
        COUNT(*) as duplicate_count
    FROM "Bom" 
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- Check 2: Show sample BOM duplicates (if any)
SELECT 
    'Sample BOM Duplicates' as check_type,
    "bomRevision",
    COUNT(*) as count,
    array_agg("bomName") as bom_names,
    array_agg("erpId") as erp_ids
FROM "Bom" 
WHERE "bomRevision" IN (
    SELECT "bomRevision" 
    FROM "Bom" 
    GROUP BY "bomRevision" 
    HAVING COUNT(*) > 1
)
GROUP BY "bomRevision"
ORDER BY COUNT(*) DESC
LIMIT 5;

-- Check 3: Verify Recipe duplicates status
SELECT 
    'Recipe Duplicates Check' as check_type,
    COUNT(*) as duplicate_groups
FROM (
    SELECT "Recipe"
    FROM "Recipe" 
    GROUP BY "Recipe"
    HAVING COUNT(*) > 1
) duplicates;

-- Check 4: Show sample Recipe duplicates (if any)
SELECT 
    'Sample Recipe Duplicates' as check_type,
    "Recipe",
    COUNT(*) as count,
    array_agg(id) as recipe_ids
FROM "Recipe" 
WHERE "Recipe" IN (
    SELECT "Recipe" 
    FROM "Recipe" 
    GROUP BY "Recipe" 
    HAVING COUNT(*) > 1
)
GROUP BY "Recipe"
ORDER BY COUNT(*) DESC
LIMIT 5;

-- Check 5: Verify orphaned BOM items
SELECT 
    'Orphaned BOM Items Check' as check_type,
    COUNT(*) as orphaned_count
FROM "BomItem" bi
WHERE NOT EXISTS (
    SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId"
);

-- Check 6: Verify data quality issues
SELECT 
    'Data Quality Issues Check' as check_type,
    COUNT(*) as problematic_records
FROM (
    SELECT 1 FROM "Bom" WHERE "erpId" LIKE 'TEMP_%'
    UNION ALL
    SELECT 1 FROM "Item" WHERE "erpId" LIKE 'TEMP_%'
    UNION ALL
    SELECT 1 FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%'
    UNION ALL
    SELECT 1 FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
    UNION ALL
    SELECT 1 FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%'
    UNION ALL
    SELECT 1 FROM "Bom" WHERE "bomName" LIKE '-%'
    UNION ALL
    SELECT 1 FROM "Recipe" WHERE "Recipe" LIKE 'RUN%'
    UNION ALL
    SELECT 1 FROM "Recipe" WHERE "Recipe" LIKE '%DELETE%'
    UNION ALL
    SELECT 1 FROM "Item" WHERE "itemName" IS NULL OR "itemName" = ''
) problematic_data;

-- Final assessment
SELECT 
    'ASSESSMENT RESULT' as status,
    CASE 
        WHEN (
            -- Check for BOM duplicates
            (SELECT COUNT(*) FROM (
                SELECT "bomRevision" FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1
            ) bom_dups) > 0
            OR
            -- Check for Recipe duplicates
            (SELECT COUNT(*) FROM (
                SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1
            ) recipe_dups) > 0
            OR
            -- Check for orphaned items
            (SELECT COUNT(*) FROM "BomItem" bi WHERE NOT EXISTS (
                SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId"
            )) > 0
        ) THEN '⚠️ COMPREHENSIVE DUPLICATE RESOLUTION NEEDED - PROCEED TO SCRIPT 06'
        ELSE '✅ READY FOR PRISMA MIGRATION - PROCEED TO SCRIPT 08'
    END as next_action;

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================
-- 
-- If this script shows remaining duplicates or orphaned records:
--   → Run script 06-comprehensive-duplicate-resolution.sql
--   → Then run script 07-final-verification.sql  
--   → Finally run script 08-run-prisma-migration.sql
--
-- If this script shows no issues:
--   → Skip to script 08-run-prisma-migration.sql
--
-- ===================================================== 