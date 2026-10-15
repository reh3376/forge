-- =====================================================
-- 07-final-verification.sql
-- =====================================================
-- Final verification that all duplicate issues are resolved
-- and the database is ready for Prisma migration
-- =====================================================

-- Check for duplicate BOM revisions
SELECT 
    'BOM Duplicates Check' as check_type,
    COUNT(*) as remaining_duplicates,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM (
    SELECT "bomRevision"
    FROM "Bom" 
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- Check for duplicate Recipe names
SELECT 
    'Recipe Duplicates Check' as check_type,
    COUNT(*) as remaining_duplicates,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM (
    SELECT "Recipe"
    FROM "Recipe" 
    GROUP BY "Recipe"
    HAVING COUNT(*) > 1
) duplicates;

-- Check for orphaned BOM items
SELECT 
    'Orphaned BOM Items Check' as check_type,
    COUNT(*) as orphaned_count,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM "BomItem" bi
WHERE NOT EXISTS (
    SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId"
);

-- Check for data quality issues
SELECT 
    'TEMP_ Prefixes Check' as check_type,
    COUNT(*) as remaining_temp_prefixes,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM (
    SELECT id FROM "Bom" WHERE "erpId" LIKE 'TEMP_%'
    UNION ALL
    SELECT id FROM "Item" WHERE "erpId" LIKE 'TEMP_%'
    UNION ALL
    SELECT id FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%'
) temp_issues;

-- Check for RUN# prefixes
SELECT 
    'RUN# Prefixes Check' as check_type,
    COUNT(*) as remaining_run_prefixes,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM (
    SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
    UNION ALL
    SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%'
) run_issues;

-- Check for DELETE markers
SELECT 
    'DELETE Markers Check' as check_type,
    COUNT(*) as remaining_delete_markers,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM (
    SELECT id FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE '%DEL%'
    UNION ALL
    SELECT id FROM "Recipe" WHERE "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE '%DEL%'
) delete_issues;

-- Check for negative BOM names
SELECT 
    'Negative BOM Names Check' as check_type,
    COUNT(*) as remaining_negative_names,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
FROM "Bom" 
WHERE "bomRevision" ~ '^-[0-9]+$';

-- Overall readiness assessment
SELECT 
    'OVERALL MIGRATION READINESS' as assessment,
    CASE 
        WHEN (
            -- No BOM duplicates
            (SELECT COUNT(*) FROM (
                SELECT "bomRevision" FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1
            ) bom_dups) = 0
            AND
            -- No Recipe duplicates
            (SELECT COUNT(*) FROM (
                SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1
            ) recipe_dups) = 0
            AND
            -- No orphaned BOM items
            (SELECT COUNT(*) FROM "BomItem" bi WHERE NOT EXISTS (
                SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId"
            )) = 0
            AND
            -- No TEMP_ prefixes
            (SELECT COUNT(*) FROM (
                SELECT id FROM "Bom" WHERE "erpId" LIKE 'TEMP_%'
                UNION ALL
                SELECT id FROM "Item" WHERE "erpId" LIKE 'TEMP_%'
                UNION ALL
                SELECT id FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%'
            ) temp_check) = 0
            AND
            -- No RUN# prefixes
            (SELECT COUNT(*) FROM (
                SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
                UNION ALL
                SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%'
            ) run_check) = 0
            AND
            -- No DELETE markers
            (SELECT COUNT(*) FROM (
                SELECT id FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE '%DEL%'
                UNION ALL
                SELECT id FROM "Recipe" WHERE "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE '%DEL%'
            ) delete_check) = 0
            AND
            -- No negative BOM names
            (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" ~ '^-[0-9]+$') = 0
        ) THEN '🎉 DATABASE READY FOR PRISMA MIGRATION'
        ELSE '⚠️ ISSUES REMAIN - DO NOT PROCEED WITH MIGRATION'
    END as status;

-- Summary statistics
SELECT 
    'Summary Statistics' as info_type,
    (SELECT COUNT(*) FROM "Bom") as total_boms,
    (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_bom_revisions,
    (SELECT COUNT(*) FROM "Recipe") as total_recipes,
    (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names,
    (SELECT COUNT(*) FROM "BomItem") as total_bom_items;

-- =====================================================
-- EXPECTED RESULTS (if all previous scripts succeeded):
-- =====================================================
-- BOM Duplicates Check: 0 remaining_duplicates, ✅ PASSED
-- Recipe Duplicates Check: 0 remaining_duplicates, ✅ PASSED  
-- Orphaned BOM Items Check: 0 orphaned_count, ✅ PASSED
-- TEMP_ Prefixes Check: 0 remaining_temp_prefixes, ✅ PASSED
-- RUN# Prefixes Check: 0 remaining_run_prefixes, ✅ PASSED
-- DELETE Markers Check: 0 remaining_delete_markers, ✅ PASSED
-- Negative BOM Names Check: 0 remaining_negative_names, ✅ PASSED
-- OVERALL MIGRATION READINESS: 🎉 DATABASE READY FOR PRISMA MIGRATION
-- ===================================================== 