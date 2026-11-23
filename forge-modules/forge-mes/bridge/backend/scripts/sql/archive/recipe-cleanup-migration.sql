-- Recipe and BOM Cleanup Migration
-- This script handles duplicate and bad recipe and BOM records
-- It first migrates foreign key dependencies before deleting problematic records

-- First check for any orphaned foreign key references
SELECT
  po.id as production_order_id,
  po."name" as production_order_number,
  b.id as bom_id,
  b."bomName" as bom_name,
  b."bomRevision" as bom_revision
FROM "ProductionOrder" po
JOIN "Bom" b ON po."bomId" = b.id
WHERE (b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE 'x-%') AND
  b.id NOT IN (
    SELECT b1.id
    FROM "Bom" b1
    JOIN "Bom" b2 ON
      (CASE
        WHEN b1."bomRevision" LIKE 'RUN%' THEN regexp_replace(b1."bomRevision", '^RUN[0-9]+-BOM-', 'BOM-')
        WHEN b1."bomRevision" LIKE 'x-%' THEN regexp_replace(b1."bomRevision", '^x-', '')
        ELSE regexp_replace(b1."bomRevision", '-(DEL|DELETE)[0-9]*$', '')
       END) = b2."bomRevision" AND
      b1."bomName" = b2."bomName"
    WHERE b1."bomRevision" LIKE 'RUN%' OR b1."bomRevision" LIKE '%DEL%' OR b1."bomRevision" LIKE '%DELETE%' OR b1."bomRevision" LIKE 'x-%'
  );

-- Start transaction
BEGIN;

-- Create mapping tables for problematic records

-- Map RUN recipes to legitimate recipes
-- First create the table
CREATE TABLE recipe_mapping (
  problem_id varchar(255),
  legitimate_id varchar(255),
  problem_name varchar(255),
  legitimate_name varchar(255)
);

-- Then populate it
-- Insert RUN recipe mappings
INSERT INTO recipe_mapping (problem_id, legitimate_id, problem_name, legitimate_name)
SELECT
  rp.id as problem_id,
  r.id as legitimate_id,
  rp."base_name" as problem_name,
  r."Recipe" as legitimate_name
FROM (
  SELECT
    id,
    "Recipe",
    regexp_replace("Recipe", '^RUN[0-9]+-', '') as base_name,
    "customerCode"
  FROM "Recipe"
  WHERE "Recipe" LIKE 'RUN%'
) rp
JOIN "Recipe" r ON r."Recipe" = rp.base_name AND r."customerCode" = rp."customerCode";

-- Insert x- recipe mappings
INSERT INTO recipe_mapping (problem_id, legitimate_id, problem_name, legitimate_name)
SELECT
  rp.id as problem_id,
  r.id as legitimate_id,
  rp."base_name" as problem_name,
  r."Recipe" as legitimate_name
FROM (
  SELECT
    id,
    "Recipe",
    regexp_replace("Recipe", '^x-', '') as base_name,
    "customerCode"
  FROM "Recipe"
  WHERE "Recipe" LIKE 'x-%'
) rp
JOIN "Recipe" r ON r."Recipe" = rp.base_name AND r."customerCode" = rp."customerCode";

-- Insert DEL recipe mappings
INSERT INTO recipe_mapping (problem_id, legitimate_id, problem_name, legitimate_name)
SELECT
  rp.id as problem_id,
  r.id as legitimate_id,
  rp."base_name" as problem_name,
  r."Recipe" as legitimate_name
FROM (
  SELECT
    id,
    "Recipe",
    regexp_replace("Recipe", '-(DEL|DELETE)[0-9]*$', '') as base_name,
    "customerCode"
  FROM "Recipe"
  WHERE "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%'
) rp
JOIN "Recipe" r ON r."Recipe" = rp.base_name AND r."customerCode" = rp."customerCode";

-- Map problematic BOMs to legitimate BOMs
-- First create the table
CREATE TABLE bom_mapping (
  problem_id varchar(255),
  legitimate_id varchar(255),
  problem_revision varchar(255),
  legitimate_revision varchar(255)
);

-- Then populate it
-- Insert RUN BOM mappings
INSERT INTO bom_mapping (problem_id, legitimate_id, problem_revision, legitimate_revision)
SELECT
  bp.id as problem_id,
  b.id as legitimate_id,
  bp."base_revision" as problem_revision,
  b."bomRevision" as legitimate_revision
FROM (
  SELECT
    id,
    "bomName",
    regexp_replace("bomRevision", '^RUN[0-9]+-BOM-', 'BOM-') as base_revision
  FROM "Bom"
  WHERE "bomRevision" LIKE 'RUN%'
) bp
JOIN "Bom" b ON b."bomRevision" = bp.base_revision AND b."bomName" = bp."bomName";

-- Insert x- BOM mappings
INSERT INTO bom_mapping (problem_id, legitimate_id, problem_revision, legitimate_revision)
SELECT
  bp.id as problem_id,
  b.id as legitimate_id,
  bp."base_revision" as problem_revision,
  b."bomRevision" as legitimate_revision
FROM (
  SELECT
    id,
    "bomName",
    regexp_replace("bomRevision", '^x-', '') as base_revision
  FROM "Bom"
  WHERE "bomRevision" LIKE 'x-%'
) bp
JOIN "Bom" b ON b."bomRevision" = bp.base_revision AND b."bomName" = bp."bomName";

-- Insert DEL BOM mappings
INSERT INTO bom_mapping (problem_id, legitimate_id, problem_revision, legitimate_revision)
SELECT
  bp.id as problem_id,
  b.id as legitimate_id,
  bp."base_revision" as problem_revision,
  b."bomRevision" as legitimate_revision
FROM (
  SELECT
    id,
    "bomName",
    regexp_replace("bomRevision", '-(DEL|DELETE)[0-9]*$', '') as base_revision
  FROM "Bom"
  WHERE "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
) bp
JOIN "Bom" b ON b."bomRevision" = bp.base_revision AND b."bomName" = bp."bomName";

-- Handle orphaned BOMs - create a fallback mapping for any problematic BOM without a mapping
INSERT INTO bom_mapping (problem_id, legitimate_id, problem_revision, legitimate_revision)
SELECT
  r.id as problem_id,
  (SELECT id FROM "Bom" WHERE "inactive" = false ORDER BY r."createdAt" DESC LIMIT 1) as legitimate_id,
  r."bomRevision" as problem_revision,
  'FALLBACK-MAPPING' as legitimate_revision
FROM "Bom" r
WHERE (r."bomRevision" LIKE 'RUN%' OR r."bomRevision" LIKE '%DEL%' OR r."bomRevision" LIKE '%DELETE%' OR r."bomRevision" LIKE 'x-%')
AND r.id NOT IN (SELECT problem_id FROM bom_mapping);

-- Create a log of affected records
CREATE TABLE migration_log (
  del_recipes_count int,
  run_recipes_count int,
  x_recipes_count int,
  del_boms_count int,
  run_boms_count int,
  x_boms_count int
);

-- Populate it
INSERT INTO migration_log (del_recipes_count, run_recipes_count, x_recipes_count, del_boms_count, run_boms_count, x_boms_count)
SELECT
  (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%') as del_recipes_count,
  (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'RUN%') as run_recipes_count,
  (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'x-%') as x_recipes_count,
  (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%') as del_boms_count,
  (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'RUN%') as run_boms_count,
  (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'x-%') as x_boms_count;

-- Record counts for reporting
SELECT * FROM migration_log;

-- STEP 1: Migrate Recipe dependencies to legitimate recipes

-- Batch records
UPDATE "Batch"
SET "recipeId" = rm.legitimate_id
FROM recipe_mapping rm
WHERE "recipeId" = rm.problem_id;

-- Lot records
UPDATE "Lot"
SET "recipeId" = rm.legitimate_id
FROM recipe_mapping rm
WHERE "recipeId" = rm.problem_id;

-- ProductionOrderRecipeInstance records
UPDATE "ProductionOrderRecipeInstance"
SET "recipeId" = rm.legitimate_id
FROM recipe_mapping rm
WHERE "recipeId" = rm.problem_id;

-- ProductionOrder records (recipes)
UPDATE "ProductionOrder"
SET "recipeId" = rm.legitimate_id
FROM recipe_mapping rm
WHERE "recipeId" = rm.problem_id;

-- Recipe.classIdId references (self-referencing foreign key)
UPDATE "Recipe"
SET "classIdId" = rm.legitimate_id
FROM recipe_mapping rm
WHERE "classIdId" = rm.problem_id;

-- ScheduleOrder records
UPDATE "ScheduleOrder"
SET "scheduleOrderRecipeId" = rm.legitimate_id
FROM recipe_mapping rm
WHERE "scheduleOrderRecipeId" = rm.problem_id;

-- STEP 2: Migrate BOM dependencies to legitimate BOMs

-- ProductionOrder records (boms)
UPDATE "ProductionOrder"
SET "bomId" = bm.legitimate_id
FROM bom_mapping bm
WHERE "bomId" = bm.problem_id;

-- UnitProcedure.bomsId records
UPDATE "UnitProcedure"
SET "bomsId" = bm.legitimate_id
FROM bom_mapping bm
WHERE "bomsId" = bm.problem_id;

-- UnitProcedure.primaryBomId records
UPDATE "UnitProcedure"
SET "primaryBomId" = bm.legitimate_id
FROM bom_mapping bm
WHERE "primaryBomId" = bm.problem_id;

-- Double-check for any remaining references before deletion
SELECT
  'ProductionOrder' as table_name,
  COUNT(*) as remaining_references
FROM "ProductionOrder"
WHERE "bomId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE 'x-%')
UNION ALL
SELECT
  'UnitProcedure.bomsId' as table_name,
  COUNT(*) as remaining_references
FROM "UnitProcedure"
WHERE "bomsId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE 'x-%')
UNION ALL
SELECT
  'UnitProcedure.primaryBomId' as table_name,
  COUNT(*) as remaining_references
FROM "UnitProcedure"
WHERE "primaryBomId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE 'x-%');

-- STEP 3: Remove relationship links for problematic recipes
DELETE FROM "_RecipeToRecipeBom"
WHERE "A" IN (SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE 'x-%');

DELETE FROM "_RecipeToRecipeParameter"
WHERE "A" IN (SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE 'x-%');

DELETE FROM "_RecipeToUnitProcedure"
WHERE "A" IN (SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE 'x-%');

-- STEP 4: Delete all problematic recipes
DELETE FROM "Recipe"
WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE 'x-%';

-- STEP 5: Remove BomItems associated with problematic BOMs
DELETE FROM "BomItem"
WHERE "bomId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE 'x-%');

-- STEP 6: Delete all problematic BOMs
-- Get the list of BOMs that would be deleted
SELECT
  b.id,
  b."bomName",
  b."bomRevision",
  (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) as po_refs,
  (SELECT COUNT(*) FROM "UnitProcedure" WHERE "bomsId" = b.id OR "primaryBomId" = b.id) as up_refs
FROM "Bom" b
WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE 'x-%';

-- Delete only if we've properly migrated all references
DELETE FROM "Bom"
WHERE ("bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE 'x-%')
AND id NOT IN (
  SELECT "bomId" FROM "ProductionOrder"
  UNION ALL
  SELECT "bomsId" FROM "UnitProcedure" WHERE "bomsId" IS NOT NULL
  UNION ALL
  SELECT "primaryBomId" FROM "UnitProcedure" WHERE "primaryBomId" IS NOT NULL
);

-- Verify migration was successful
SELECT
  (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'RUN%') as remaining_run_recipes,
  (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%') as remaining_del_recipes,
  (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'x-%') as remaining_x_recipes,
  (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'RUN%') as remaining_run_boms,
  (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%') as remaining_del_boms,
  (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'x-%') as remaining_x_boms,
  (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" IN (
    SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE 'x-%'
  )) as remaining_bom_items;

-- Report any BOMs that couldn't be deleted due to references
SELECT
  b.id,
  b."bomName",
  b."bomRevision",
  'ProductionOrder' as referenced_by
FROM "Bom" b
JOIN "ProductionOrder" po ON po."bomId" = b.id
WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE 'x-%'
UNION ALL
SELECT
  b.id,
  b."bomName",
  b."bomRevision",
  'UnitProcedure.bomsId' as referenced_by
FROM "Bom" b
JOIN "UnitProcedure" up ON up."bomsId" = b.id
WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE 'x-%'
UNION ALL
SELECT
  b.id,
  b."bomName",
  b."bomRevision",
  'UnitProcedure.primaryBomId' as referenced_by
FROM "Bom" b
JOIN "UnitProcedure" up ON up."primaryBomId" = b.id
WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE 'x-%';

-- Cleanup temporary tables
DROP TABLE recipe_mapping;
DROP TABLE bom_mapping;
DROP TABLE migration_log;

-- Commit the transaction
COMMIT ;