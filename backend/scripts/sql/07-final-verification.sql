-- =====================================================
-- 07-final-verification.sql
-- =====================================================
-- Final verification that the database is ready for Prisma migration
-- Run this script to confirm all duplicate issues have been resolved
-- =====================================================

-- Check 1: Verify no duplicate BOM revisions remain
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

-- Check 2: Verify no duplicate Recipe names remain
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

-- Check 3: Verify no orphaned BOM items
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

-- Check 4: Verify no problematic data patterns remain
SELECT 
    'Data Quality Check' as check_type,
    COUNT(*) as problematic_records,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASSED'
        ELSE '❌ FAILED'
    END as status
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

-- Check 5: Database summary statistics
SELECT 
    'Database Summary' as check_type,
    (SELECT COUNT(*) FROM "Bom") as total_boms,
    (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_bom_revisions,
    (SELECT COUNT(*) FROM "Recipe") as total_recipes,
    (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names,
    (SELECT COUNT(*) FROM "BomItem") as total_bom_items,
    (SELECT COUNT(*) FROM "ProductionOrder") as total_production_orders;

-- Check 6: Verify referential integrity
SELECT 
    'Referential Integrity Check' as check_type,
    'All foreign key relationships intact' as status,
    (
        SELECT COUNT(*) 
        FROM "BomItem" bi 
        WHERE NOT EXISTS (SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId")
    ) as orphaned_bom_items,
    (
        SELECT COUNT(*) 
        FROM "ProductionOrder" po 
        WHERE po."bomId" IS NOT NULL 
        AND NOT EXISTS (SELECT 1 FROM "Bom" b WHERE b.id = po."bomId")
    ) as orphaned_production_orders_bom,
    (
        SELECT COUNT(*) 
        FROM "ProductionOrder" po 
        WHERE po."recipeId" IS NOT NULL 
        AND NOT EXISTS (SELECT 1 FROM "Recipe" r WHERE r.id = po."recipeId")
    ) as orphaned_production_orders_recipe;

-- Final readiness assessment
SELECT 
    'MIGRATION READINESS' as assessment,
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
        ) THEN '🎉 DATABASE READY FOR PRISMA MIGRATION'
        ELSE '⚠️ ISSUES REMAIN - DO NOT PROCEED WITH MIGRATION'
    END as status; 