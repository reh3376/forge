/*
  Warnings:

  - The values [StraightBourbon,HighRye,FourGrain] on the enum `EnumMashingProtocolTemplateCategory` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[Recipe]` on the table `Recipe` will be added. If there are existing duplicate values, this will fail.

*/

-- =====================================================
-- STEP 1: Drop the trigger that prevents Recipe modifications
-- =====================================================
DROP TRIGGER IF EXISTS prevent_update_on_complete_lot ON "Lot";
DROP TRIGGER IF EXISTS prevent_delete_on_complete_lot ON "Lot";

-- =====================================================
-- STEP 2: Resolve Recipe duplicates before creating unique constraint
-- =====================================================

-- Migrate all references to point to the most recent Recipe for each duplicate group
-- Update Lot table references
UPDATE "Lot" 
SET "recipeId" = (
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "Lot"."recipeId" 
    WHERE br."Recipe" = r."Recipe"
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

-- Update Batch table references
UPDATE "Batch" 
SET "recipeId" = (
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "Batch"."recipeId" 
    WHERE br."Recipe" = r."Recipe"
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

-- Update ProductionOrderRecipeInstance table references
UPDATE "ProductionOrderRecipeInstance" 
SET "recipeId" = (
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "ProductionOrderRecipeInstance"."recipeId" 
    WHERE br."Recipe" = r."Recipe"
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

-- Update ProductionOrder table references
UPDATE "ProductionOrder" 
SET "recipeId" = (
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "ProductionOrder"."recipeId" 
    WHERE br."Recipe" = r."Recipe"
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
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "Recipe"."classIdId" 
    WHERE br."Recipe" = r."Recipe"
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

-- Update ScheduleOrder table references
UPDATE "ScheduleOrder" 
SET "scheduleOrderRecipeId" = (
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "ScheduleOrder"."scheduleOrderRecipeId" 
    WHERE br."Recipe" = r."Recipe"
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

-- Update many-to-many relationship tables
UPDATE "_RecipeToRecipeBom" 
SET "A" = (
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "_RecipeToRecipeBom"."A" 
    WHERE br."Recipe" = r."Recipe"
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
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "_RecipeToRecipeParameter"."A" 
    WHERE br."Recipe" = r."Recipe"
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
    WITH best_recipes AS (
        SELECT DISTINCT
            "Recipe",
            FIRST_VALUE(id) OVER (
                PARTITION BY "Recipe" 
                ORDER BY "createdAt" DESC
            ) as target_recipe_id
        FROM "Recipe"
        WHERE "Recipe" IN (
            SELECT "Recipe" 
            FROM "Recipe" 
            GROUP BY "Recipe"
            HAVING COUNT(*) > 1
        )
    )
    SELECT br.target_recipe_id 
    FROM best_recipes br 
    JOIN "Recipe" r ON r.id = "_RecipeToUnitProcedure"."A" 
    WHERE br."Recipe" = r."Recipe"
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

-- Delete duplicate Recipe records (keeping only the most recent for each name)
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
-- STEP 3: Original migration content
-- =====================================================

-- AlterEnum
BEGIN;
CREATE TYPE "EnumMashingProtocolTemplateCategory_new" AS ENUM ('RyeBourbon', 'WheatedBourbon', 'FourGrainBourbon', 'RyeWhiskey', 'WheatWhiskey', 'MaltWhiskey');
ALTER TABLE "MashingProtocol" ALTER COLUMN "templateCategory" TYPE "EnumMashingProtocolTemplateCategory_new" USING ("templateCategory"::text::"EnumMashingProtocolTemplateCategory_new");
ALTER TYPE "EnumMashingProtocolTemplateCategory" RENAME TO "EnumMashingProtocolTemplateCategory_old";
ALTER TYPE "EnumMashingProtocolTemplateCategory_new" RENAME TO "EnumMashingProtocolTemplateCategory";
DROP TYPE "EnumMashingProtocolTemplateCategory_old";
COMMIT;

-- CreateIndex (this should now work since duplicates are resolved)
CREATE UNIQUE INDEX "Recipe_Recipe_key" ON "Recipe"("Recipe");

-- =====================================================
-- STEP 4: Re-add the trigger to protect complete lots
-- =====================================================
CREATE OR REPLACE FUNCTION prevent_modification_complete_lots()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the status is 'Complete'
    IF OLD.status = 'Complete' THEN
        RAISE EXCEPTION 'Operation not allowed: Record is immutable.';
    END IF;

    -- Determine the operation type
    IF TG_OP = 'DELETE' THEN
        RETURN OLD; -- For DELETE operations
    ELSE
        RETURN NEW; -- For UPDATE operations
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Re-create the triggers
CREATE TRIGGER prevent_update_on_complete_lot
    BEFORE UPDATE ON "Lot"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_modification_complete_lots();

CREATE TRIGGER prevent_delete_on_complete_lot
    BEFORE DELETE ON "Lot"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_modification_complete_lots();
