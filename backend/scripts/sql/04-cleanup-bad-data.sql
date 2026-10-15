-- =====================================================
-- STEP 4: CLEANUP OTHER BAD DATA ISSUES
-- =====================================================
-- This script cleans up other bad data issues:
-- - TEMP_ prefixed ERP IDs in Bom, Item, and Vendor tables
-- - Negative or problematic BOM names
-- - RUN# prefixes in BOM revisions and Recipe names
-- - DEL/DELETE markers in BOM revisions and Recipe names
-- - Empty or problematic names
-- Run this AFTER step 3 (delete duplicate BOMs)

BEGIN;

SELECT 'STARTING BAD DATA CLEANUP' as step, NOW() as started_at;

-- =====================================================
-- 1. Fix TEMP_ ERP IDs (convert back to positive)
-- =====================================================
SELECT 'FIXING TEMP ERP IDs' as step;

-- Fix Bom table TEMP_ erpIds
UPDATE "Bom"
SET "erpId" = SUBSTRING("erpId" FROM 6)  -- Remove 'TEMP_' prefix (PostgreSQL syntax)
WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Fixed Bom TEMP_ erpIds' as status, 
       (SELECT COUNT(*) FROM "Bom" WHERE "erpId" LIKE 'TEMP_%') as remaining_count;

-- Fix Item table TEMP_ erpIds  
UPDATE "Item"
SET "erpId" = SUBSTRING("erpId" FROM 6)  -- Remove 'TEMP_' prefix
WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Fixed Item TEMP_ erpIds' as status,
       (SELECT COUNT(*) FROM "Item" WHERE "erpId" LIKE 'TEMP_%') as remaining_count;

-- Fix Vendor table TEMP_ erpIds
UPDATE "Vendor"
SET "erpId" = SUBSTRING("erpId" FROM 6)  -- Remove 'TEMP_' prefix
WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Fixed Vendor TEMP_ erpIds' as status,
       (SELECT COUNT(*) FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%') as remaining_count;

-- =====================================================
-- 2. Fix RUN# prefixes in BOM revisions
-- =====================================================
SELECT 'FIXING RUN PREFIXES IN BOM REVISIONS' as step;

-- Remove RUN0-, RUN1-, RUN2-, RUN3-, RUN4- prefixes from bomRevision
UPDATE "Bom"
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g')
WHERE "bomRevision" ~ '^RUN[0-9]+-';

SELECT 'Fixed RUN prefixes in BOM revisions' as status,
       (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'RUN%') as remaining_count;

-- =====================================================
-- 3. Fix RUN# prefixes in Recipe names
-- =====================================================
SELECT 'FIXING RUN PREFIXES IN RECIPE NAMES' as step;

-- Remove RUN0-, RUN1-, RUN2-, RUN3-, RUN4- prefixes from Recipe field
UPDATE "Recipe"
SET "Recipe" = REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g')
WHERE "Recipe" ~ '^RUN[0-9]+-';

SELECT 'Fixed RUN prefixes in Recipe names' as status,
       (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'RUN%') as remaining_count;

-- =====================================================
-- 4. Fix negative or problematic BOM names
-- =====================================================
SELECT 'FIXING PROBLEMATIC BOM NAMES' as step;

-- Fix negative BOM names (like '-9', '-8', etc.)
UPDATE "Bom"
SET "bomName" = 'BOM_' || COALESCE("erpId", 'UNKNOWN')
WHERE "bomName" ~ '^-[0-9]+$';

SELECT 'Fixed negative BOM names' as status,
       (SELECT COUNT(*) FROM "Bom" WHERE "bomName" ~ '^-[0-9]+$') as remaining_count;

-- Fix BOM names that are just numbers (make them more descriptive)
UPDATE "Bom"
SET "bomName" = 'BOM_' || "bomName"
WHERE "bomName" ~ '^[0-9]+$';

SELECT 'Fixed numeric BOM names' as status,
       (SELECT COUNT(*) FROM "Bom" WHERE "bomName" ~ '^[0-9]+$') as remaining_count;

-- =====================================================
-- 5. Clean up DELETE markers in BOM revisions
-- =====================================================
SELECT 'CLEANING DELETE MARKERS IN BOM REVISIONS' as step;

-- Count BOMs with DELETE markers that have no items
SELECT 'BOMs with DELETE markers (no items)' as check_type, COUNT(*) as count
FROM "Bom" b
LEFT JOIN "BomItem" bi ON b.id = bi."bomId"
WHERE (b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE '%DEL')
AND bi.id IS NULL;

-- Delete BOMs with DELETE markers that have no BOM items
DELETE FROM "Bom"
WHERE id IN (
    SELECT b.id
    FROM "Bom" b
    LEFT JOIN "BomItem" bi ON b.id = bi."bomId"
    WHERE (b."bomRevision" LIKE '%DELETE%' OR b."bomRevision" LIKE '%DEL')
    AND bi.id IS NULL
);

SELECT 'Deleted empty BOMs with DELETE markers' as status,
       (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE '%DEL') as remaining_count;

-- For BOMs with DELETE markers that still have items, remove the DELETE suffix
UPDATE "Bom"
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '-DELETE[0-9]*$', '', 'g')
WHERE "bomRevision" LIKE '%DELETE%';

UPDATE "Bom"
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '-DEL$', '', 'g')
WHERE "bomRevision" LIKE '%DEL';

SELECT 'Cleaned DELETE suffixes from BOM revisions' as status,
       (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE '%DEL%') as remaining_count;

-- =====================================================
-- 6. Clean up DELETE markers in Recipe names
-- =====================================================
SELECT 'CLEANING DELETE MARKERS IN RECIPE NAMES' as step;

-- Count Recipes with DELETE markers that have no production orders
SELECT 'Recipes with DELETE markers (no production orders)' as check_type, COUNT(*) as count
FROM "Recipe" r
LEFT JOIN "ProductionOrder" po ON r.id = po."recipeId"
WHERE (r."Recipe" LIKE '%DELETE%' OR r."Recipe" LIKE '%DEL')
AND po.id IS NULL;

-- Delete Recipes with DELETE markers that have no production orders
DELETE FROM "Recipe"
WHERE id IN (
    SELECT r.id
    FROM "Recipe" r
    LEFT JOIN "ProductionOrder" po ON r.id = po."recipeId"
    WHERE (r."Recipe" LIKE '%DELETE%' OR r."Recipe" LIKE '%DEL')
    AND po.id IS NULL
);

SELECT 'Deleted empty Recipes with DELETE markers' as status,
       (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE '%DEL%') as remaining_count;

-- For Recipes with DELETE markers that still have production orders, remove the DELETE suffix
UPDATE "Recipe"
SET "Recipe" = REGEXP_REPLACE("Recipe", '-DELETE[0-9]*$', '', 'g')
WHERE "Recipe" LIKE '%DELETE%';

UPDATE "Recipe"
SET "Recipe" = REGEXP_REPLACE("Recipe", '-DEL$', '', 'g')
WHERE "Recipe" LIKE '%DEL';

SELECT 'Cleaned DELETE suffixes from Recipe names' as status,
       (SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE '%DEL%') as remaining_count;

-- =====================================================
-- 7. Fix empty or null item names
-- =====================================================
SELECT 'FIXING EMPTY ITEM NAMES' as step;

-- Fix empty item names
UPDATE "Item"
SET "itemName" = CASE
    WHEN "itemNumber" IS NOT NULL AND "itemNumber" != '' THEN "itemNumber"
    WHEN "erpId" IS NOT NULL AND "erpId" != '' THEN 'Item_' || "erpId"
    ELSE 'Unnamed_Item_' || id
END
WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' ';

SELECT 'Fixed empty item names' as status,
       (SELECT COUNT(*) FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' ') as remaining_count;

-- =====================================================
-- 8. Fix any remaining ERP-related prefixes
-- =====================================================
SELECT 'FIXING ERP-RELATED PREFIXES' as step;

-- Remove any remaining ERP- prefixes from BOM revisions
UPDATE "Bom"
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-ERP-', '', 'g')
WHERE "bomRevision" ~ '^RUN[0-9]+-ERP-';

SELECT 'Fixed ERP prefixes in BOM revisions' as status,
       (SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%ERP-%') as remaining_count;

-- =====================================================
-- 9. Final verification
-- =====================================================
SELECT 'FINAL BAD DATA VERIFICATION' as step;

-- Check for remaining TEMP_ erpIds
SELECT 'Remaining TEMP_ erpIds in Bom' as check_type, COUNT(*) as count
FROM "Bom" WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Remaining TEMP_ erpIds in Item' as check_type, COUNT(*) as count
FROM "Item" WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Remaining TEMP_ erpIds in Vendor' as check_type, COUNT(*) as count
FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%';

-- Check for remaining RUN prefixes
SELECT 'Remaining RUN prefixes in BOM revisions' as check_type, COUNT(*) as count
FROM "Bom" WHERE "bomRevision" LIKE 'RUN%';

SELECT 'Remaining RUN prefixes in Recipe names' as check_type, COUNT(*) as count
FROM "Recipe" WHERE "Recipe" LIKE 'RUN%';

-- Check for remaining negative BOM names
SELECT 'Remaining negative BOM names' as check_type, COUNT(*) as count
FROM "Bom" WHERE "bomName" ~ '^-[0-9]+$';

-- Check for remaining DELETE markers
SELECT 'Remaining DELETE markers in BOM revisions' as check_type, COUNT(*) as count
FROM "Bom" WHERE "bomRevision" LIKE '%DELETE%' OR "bomRevision" LIKE '%DEL%';

SELECT 'Remaining DELETE markers in Recipe names' as check_type, COUNT(*) as count
FROM "Recipe" WHERE "Recipe" LIKE '%DELETE%' OR "Recipe" LIKE '%DEL%';

-- Check for empty item names
SELECT 'Remaining empty item names' as check_type, COUNT(*) as count
FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' ';

SELECT 'BAD DATA CLEANUP COMPLETED' as step, NOW() as completed_at;

-- Review results above, then either COMMIT or ROLLBACK
-- If all verification checks show 0 counts:
-- COMMIT;

-- If there are any issues:
-- ROLLBACK; 