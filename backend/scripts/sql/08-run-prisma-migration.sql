-- =====================================================
-- 08-run-prisma-migration.sql
-- =====================================================
-- Final script to run the Prisma migration after all duplicates
-- and data quality issues have been resolved.
--
-- PREREQUISITES: 
-- - Scripts 01-04 completed (initial cleanup)
-- - Script 05 run (verification shows issues)
-- - Script 06 completed (comprehensive duplicate resolution)
-- - Script 07 completed (final verification passes)
--
-- Execution: Run this script to complete the migration process
-- =====================================================

-- Final pre-migration verification
SELECT 
    'PRE-MIGRATION VERIFICATION' as check_type,
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
        ) THEN '✅ READY FOR MIGRATION'
        ELSE '❌ ISSUES REMAIN - DO NOT PROCEED'
    END as status;

-- Database state summary
SELECT 
    'DATABASE STATE SUMMARY' as info,
    (SELECT COUNT(*) FROM "Bom") as total_boms,
    (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_bom_revisions,
    (SELECT COUNT(*) FROM "Recipe") as total_recipes,
    (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names,
    (SELECT COUNT(*) FROM "BomItem") as total_bom_items;

-- =====================================================
-- MIGRATION EXECUTION INSTRUCTIONS
-- =====================================================
--
-- If the verification above shows "✅ READY FOR MIGRATION":
--
-- 1. Exit this SQL session
-- 2. Open terminal in the project directory:
--    cd /path/to/whk-recipe-configuration/apps/whk-recipe-configuration
-- 3. Run the Prisma migration:
--    npx prisma migrate deploy
--
-- If the verification shows "❌ ISSUES REMAIN":
-- 1. Review and re-run script 06 (comprehensive duplicate resolution)
-- 2. Run script 07 (final verification)
-- 3. Return to this script
--
-- =====================================================

-- Post-migration verification queries (run these AFTER npx prisma migrate deploy)
-- 
-- Check migration status:
-- SELECT migration_name, finished_at, applied_steps_count 
-- FROM "_prisma_migrations" 
-- ORDER BY started_at DESC 
-- LIMIT 5;
--
-- Verify unique constraints are working:
-- SELECT 
--     'UNIQUE CONSTRAINTS CHECK' as check,
--     CASE 
--         WHEN (SELECT COUNT(*) FROM "Bom") = (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom")
--         AND (SELECT COUNT(*) FROM "Recipe") = (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe")
--         THEN '✅ ALL CONSTRAINTS WORKING'
--         ELSE '❌ CONSTRAINT VIOLATIONS'
--     END as status;
--
-- ===================================================== 