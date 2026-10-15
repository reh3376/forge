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
)
AND "bomRevision" IN (
    SELECT "bomRevision" 
    FROM "Bom" 
    GROUP BY "bomRevision" 
    HAVING COUNT(*) > 1
);

-- Step 4: Clean up any orphaned BOM items
DELETE FROM "BomItem" 
WHERE NOT EXISTS (
    SELECT 1 FROM "Bom" b WHERE b.id = "BomItem"."bomId"
);

-- =====================================================
-- PART 2: COMPREHENSIVE RECIPE DUPLICATE RESOLUTION
-- =====================================================

-- Strategy: For each duplicate Recipe name, keep the most recent one (by createdAt)
-- and migrate all references to point to the kept recipe

-- Step 1: Update Batch table references
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

-- Step 2: Update ProductionOrderRecipeInstance table references
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

-- Step 3: Update ProductionOrder table references
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

-- Step 4: Update Recipe self-references (classIdId)
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

-- Step 5: Update ScheduleOrder table references
UPDATE "ScheduleOrder" 
SET "scheduleOrderRecipeId" = (
    SELECT 
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe" r2
    WHERE r2."Recipe" = (
        SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ScheduleOrder"."scheduleOrderRecipeId"
    )
    LIMIT 1
)
WHERE "scheduleOrderRecipeId" IN (
    SELECT r.id
    FROM "Recipe" r
    WHERE r."Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
);

-- Step 6: Update many-to-many relationship tables
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

-- Step 7: Update Comment table references
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

-- Step 8: Delete duplicate Recipe records (keeping only the most recent for each name)
DELETE FROM "Recipe" 
WHERE id NOT IN (
    SELECT DISTINCT
        FIRST_VALUE(id) OVER (
            PARTITION BY "Recipe" 
            ORDER BY "createdAt" DESC
        )
    FROM "Recipe"
    WHERE "Recipe" IN (
        SELECT "Recipe" 
        FROM "Recipe" 
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
    )
)
AND "Recipe" IN (
    SELECT "Recipe" 
    FROM "Recipe" 
    GROUP BY "Recipe"
    HAVING COUNT(*) > 1
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

-- Final summary
SELECT 
    'Final Database State' as status,
    (SELECT COUNT(*) FROM "Bom") as total_boms,
    (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_bom_revisions,
    (SELECT COUNT(*) FROM "Recipe") as total_recipes,
    (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names,
    (SELECT COUNT(*) FROM "BomItem") as total_bom_items;

-- =====================================================
-- MANUAL COMMIT/ROLLBACK CONTROL
-- =====================================================
-- Review the verification results above.
-- If everything looks correct, run: COMMIT;
-- If there are issues, run: ROLLBACK;

-- COMMIT;
-- ROLLBACK; 