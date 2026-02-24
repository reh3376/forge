-- =====================================================
-- 08-run-prisma-migration.sql
-- =====================================================
-- Final script to run the Prisma migration after all
-- duplicate issues have been resolved
-- =====================================================

-- Final pre-migration verification
-- This should show all checks passing if previous scripts were successful

-- Quick duplicate check
SELECT 
    'Pre-Migration BOM Check' as check_type,
    COUNT(*) as duplicate_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'READY ✅'
        ELSE 'NOT READY ❌'
    END as status
FROM (
    SELECT "bomRevision"
    FROM "Bom" 
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

SELECT 
    'Pre-Migration Recipe Check' as check_type,
    COUNT(*) as duplicate_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'READY ✅'
        ELSE 'NOT READY ❌'
    END as status
FROM (
    SELECT "Recipe"
    FROM "Recipe" 
    GROUP BY "Recipe"
    HAVING COUNT(*) > 1
) duplicates;

-- =====================================================
-- PRISMA MIGRATION EXECUTION
-- =====================================================

-- If the above checks show "READY ✅", proceed with:
-- 
-- 1. Exit this SQL session
-- 2. Run the following command in your terminal:
--
--    npx prisma migrate deploy
--
-- 3. The migration should complete successfully
-- 4. Return to verify the results below

-- =====================================================
-- POST-MIGRATION VERIFICATION
-- =====================================================

-- After running "npx prisma migrate deploy", run these queries
-- to verify the migration completed successfully:

-- Check that the unique constraint was created successfully
SELECT 
    'Unique Constraint Check' as check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints 
            WHERE table_name = 'Bom' 
            AND constraint_type = 'UNIQUE'
            AND constraint_name LIKE '%bomRevision%'
        ) THEN 'CONSTRAINT CREATED ✅'
        ELSE 'CONSTRAINT MISSING ❌'
    END as status;

-- Verify migration status
SELECT 
    'Migration Status' as check_type,
    migration_name,
    applied_steps_count,
    CASE 
        WHEN finished_at IS NOT NULL THEN 'COMPLETED ✅'
        ELSE 'INCOMPLETE ❌'
    END as status
FROM "_prisma_migrations"
ORDER BY started_at DESC
LIMIT 5;

-- Final summary
SELECT 
    'FINAL STATUS' as summary,
    (SELECT COUNT(*) FROM "Bom") as total_boms,
    (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_revisions,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Bom") = (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom")
        THEN 'ALL BOMS HAVE UNIQUE REVISIONS ✅'
        ELSE 'DUPLICATES STILL EXIST ❌'
    END as bom_status,
    (SELECT COUNT(*) FROM "Recipe") as total_recipes,
    (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_names,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Recipe") = (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe")
        THEN 'ALL RECIPES HAVE UNIQUE NAMES ✅'
        ELSE 'DUPLICATES STILL EXIST ❌'
    END as recipe_status;

-- =====================================================
-- SUCCESS CRITERIA
-- =====================================================
-- 
-- The migration is successful if:
-- 1. "npx prisma migrate deploy" completes without errors
-- 2. Unique Constraint Check shows "CONSTRAINT CREATED ✅"
-- 3. Migration Status shows "COMPLETED ✅" for the latest migration
-- 4. Final summary shows unique counts match total counts
-- 
-- If any of these fail, review the previous scripts and
-- ensure all duplicate resolution steps were completed.
-- ===================================================== 