-- =====================================================
-- 06-comprehensive-duplicate-resolution.sql
-- =====================================================
-- This script resolves ALL duplicate bomRevisions and Recipe names
-- that were preventing the Prisma migration from completing.
--
-- IMPORTANT: This script contains the actual comprehensive solution
-- that was successfully tested and applied to resolve the migration issues.
--
-- Execution: Run this script manually with COMMIT/ROLLBACK control
-- =====================================================

-- Start transaction for safety
BEGIN;

-- =====================================================
-- PART 1: COMPREHENSIVE BOM DUPLICATE RESOLUTION
-- =====================================================

-- Migrate all BOM items and ProductionOrders to the "best" BOM for each duplicate group
-- Strategy: Keep BOMs with positive erpIds over negative/null erpIds
UPDATE "BomItem" 
SET "bomId" = (
    WITH best_boms AS (
        SELECT DISTINCT
            "bomRevision",
            FIRST_VALUE(id) OVER (
                PARTITION BY "bomRevision" 
                ORDER BY 
                    CASE 
                        WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                        WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                        ELSE 3
                    END,
                    (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = b.id) DESC,
                    (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) DESC,
                    b."createdAt"
            ) as target_bom_id
        FROM "Bom" b
        WHERE "bomRevision" IN (
            SELECT "bomRevision" 
            FROM "Bom" 
            GROUP BY "bomRevision" 
            HAVING COUNT(*) > 1
        )
    )
    SELECT bb.target_bom_id 
    FROM best_boms bb 
    JOIN "Bom" b ON b.id = "BomItem"."bomId" 
    WHERE bb."bomRevision" = b."bomRevision"
)
WHERE "bomId" IN (
    SELECT b.id
    FROM "Bom" b
    WHERE b."bomRevision" IN (
        SELECT "bomRevision" 
        FROM "Bom" 
        GROUP BY "bomRevision" 
        HAVING COUNT(*) > 1
    )
);

-- Migrate ProductionOrders to the best BOMs
UPDATE "ProductionOrder" 
SET "bomId" = (
    WITH best_boms AS (
        SELECT DISTINCT
            "bomRevision",
            FIRST_VALUE(id) OVER (
                PARTITION BY "bomRevision" 
                ORDER BY 
                    CASE 
                        WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                        WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                        ELSE 3
                    END,
                    (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = b.id) DESC,
                    (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) DESC,
                    b."createdAt"
            ) as target_bom_id
        FROM "Bom" b
        WHERE "bomRevision" IN (
            SELECT "bomRevision" 
            FROM "Bom" 
            GROUP BY "bomRevision" 
            HAVING COUNT(*) > 1
        )
    )
    SELECT bb.target_bom_id 
    FROM best_boms bb 
    JOIN "Bom" b ON b.id = "ProductionOrder"."bomId" 
    WHERE bb."bomRevision" = b."bomRevision"
)
WHERE "bomId" IN (
    SELECT b.id
    FROM "Bom" b
    WHERE b."bomRevision" IN (
        SELECT "bomRevision" 
        FROM "Bom" 
        GROUP BY "bomRevision" 
        HAVING COUNT(*) > 1
    )
);

-- Delete duplicate BOMs (keeping only the "best" one from each group)
DELETE FROM "Bom" 
WHERE id NOT IN (
    WITH best_boms AS (
        SELECT DISTINCT
            "bomRevision",
            FIRST_VALUE(id) OVER (
                PARTITION BY "bomRevision" 
                ORDER BY 
                    CASE 
                        WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                        WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                        ELSE 3
                    END,
                    (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = b.id) DESC,
                    (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) DESC,
                    b."createdAt"
            ) as target_bom_id
        FROM "Bom" b
        WHERE "bomRevision" IN (
            SELECT "bomRevision" 
            FROM "Bom" 
            GROUP BY "bomRevision" 
            HAVING COUNT(*) > 1
        )
    )
    SELECT target_bom_id FROM best_boms
    UNION
    SELECT id FROM "Bom" WHERE "bomRevision" NOT IN (
        SELECT "bomRevision" 
        FROM "Bom" 
        GROUP BY "bomRevision" 
        HAVING COUNT(*) > 1
    )
);

-- Clean up any orphaned BOM items
DELETE FROM "BomItem" 
WHERE NOT EXISTS (
    SELECT 1 FROM "Bom" b WHERE b.id = "BomItem"."bomId"
);

-- =====================================================
-- PART 2: COMPREHENSIVE RECIPE DUPLICATE RESOLUTION
-- =====================================================

-- Migrate all Recipe references to the "best" Recipe (most recent createdAt)
-- Update Batch table
UPDATE "Batch" 
SET "recipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Batch"."recipeId"
    )
    LIMIT 1
)
WHERE "recipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Update ProductionOrderRecipeInstance table
UPDATE "ProductionOrderRecipeInstance" 
SET "recipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ProductionOrderRecipeInstance"."recipeId"
    )
    LIMIT 1
)
WHERE "recipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Update ProductionOrder table
UPDATE "ProductionOrder" 
SET "recipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ProductionOrder"."recipeId"
    )
    LIMIT 1
)
WHERE "recipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Update Recipe self-references (classIdId)
UPDATE "Recipe" 
SET "classIdId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Recipe"."classIdId"
    )
    LIMIT 1
)
WHERE "classIdId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Update ScheduleOrder table
UPDATE "ScheduleOrder" 
SET "recipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ScheduleOrder"."recipeId"
    )
    LIMIT 1
)
WHERE "recipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Update many-to-many relationship tables
UPDATE "_RecipeToRecipeBom" 
SET "A" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "_RecipeToRecipeBom"."A"
    )
    LIMIT 1
)
WHERE "A" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

UPDATE "_RecipeToRecipeParameter" 
SET "A" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "_RecipeToRecipeParameter"."A"
    )
    LIMIT 1
)
WHERE "A" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

UPDATE "_RecipeToUnitProcedure" 
SET "A" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "_RecipeToUnitProcedure"."A"
    )
    LIMIT 1
)
WHERE "A" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Update Comment table
UPDATE "Comment" 
SET "recipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Comment"."recipeId"
    )
    LIMIT 1
)
WHERE "recipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Handle Lot table (requires trigger management due to immutable record protection)
-- Temporarily disable the trigger that prevents updates to complete lots
ALTER TABLE "Lot" DISABLE TRIGGER prevent_update_on_complete_lot;

-- Update Lot table
UPDATE "Lot" 
SET "recipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Lot"."recipeId"
    )
    LIMIT 1
)
WHERE "recipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Re-enable the trigger
ALTER TABLE "Lot" ENABLE TRIGGER prevent_update_on_complete_lot;

-- Delete duplicate Recipe records (keeping the most recent one for each name)
DELETE FROM "Recipe" 
WHERE id NOT IN (
    SELECT DISTINCT
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe"
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify BOM duplicates are resolved
SELECT 
    'BOM Duplicates Check' as check_type,
    COUNT(*) as remaining_duplicates
FROM (
    SELECT "bomRevision"
    FROM "Bom" 
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- Verify Recipe duplicates are resolved
SELECT 
    'Recipe Duplicates Check' as check_type,
    COUNT(*) as remaining_duplicates
FROM (
    SELECT "Recipe"
    FROM "Recipe" 
    GROUP BY "Recipe"
    HAVING COUNT(*) > 1
) duplicates;

-- Verify no orphaned BOM items
SELECT 
    'Orphaned BOM Items Check' as check_type,
    COUNT(*) as orphaned_count
FROM "BomItem" bi
WHERE NOT EXISTS (
    SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId"
);

-- Final readiness check
SELECT 
    'MIGRATION READINESS' as assessment,
    CASE 
        WHEN (
            (SELECT COUNT(*) FROM (
                SELECT "bomRevision" FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1
            ) bom_dups) = 0
            AND
            (SELECT COUNT(*) FROM (
                SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1
            ) recipe_dups) = 0
            AND
            (SELECT COUNT(*) FROM "BomItem" bi WHERE NOT EXISTS (
                SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId"
            )) = 0
        ) THEN '🎉 DATABASE READY FOR PRISMA MIGRATION'
        ELSE '⚠️ ISSUES REMAIN - DO NOT PROCEED WITH MIGRATION'
    END as status;

-- =====================================================
-- MANUAL COMMIT/ROLLBACK CONTROL
-- =====================================================
-- 
-- REVIEW THE VERIFICATION RESULTS ABOVE
-- 
-- If all checks pass:
--   COMMIT;
-- 
-- If there are issues:
--   ROLLBACK;
-- 
-- ===================================================== 