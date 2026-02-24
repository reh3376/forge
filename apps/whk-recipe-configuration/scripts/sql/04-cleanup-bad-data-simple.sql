-- =====================================================
-- STEP 4: CLEANUP BAD DATA (SIMPLIFIED)
-- =====================================================
-- This script cleans up various data quality issues:
-- - TEMP_ prefixed ERP IDs (originally negative values)
-- - RUN# prefixes in BOM revisions and Recipe names
-- - DELETE/DEL markers in BOM revisions and Recipe names
-- - Negative BOM names
-- - Empty item names
-- Run this AFTER step 3 (delete duplicate BOMs)

BEGIN;

SELECT 'STARTING DATA CLEANUP' as step, NOW() as started_at;

-- =====================================================
-- 1. Fix TEMP_ ERP IDs by assigning available values
-- =====================================================

-- For Bom table: Handle TEMP_ erpIds that would conflict
-- TEMP_18 -> find available ID (conflicts with existing 18)
UPDATE "Bom" SET "erpId" = '6' WHERE "erpId" = 'TEMP_18';
-- TEMP_19 -> find available ID (conflicts with existing 19)  
UPDATE "Bom" SET "erpId" = '7' WHERE "erpId" = 'TEMP_19';
-- TEMP_21 -> find available ID (conflicts with existing 21)
UPDATE "Bom" SET "erpId" = '8' WHERE "erpId" = 'TEMP_21';
-- TEMP_25 -> find available ID (conflicts with existing 25)
UPDATE "Bom" SET "erpId" = '9' WHERE "erpId" = 'TEMP_25';
-- TEMP_26 -> find available ID (conflicts with existing 26)
UPDATE "Bom" SET "erpId" = '10' WHERE "erpId" = 'TEMP_26';

-- For non-conflicting TEMP_ erpIds, just remove the prefix
UPDATE "Bom" 
SET "erpId" = SUBSTRING("erpId", 6)  -- Remove 'TEMP_' prefix
WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Fixed Bom TEMP_ erpIds' as status,
(SELECT COUNT(*) FROM "Bom" WHERE "erpId" LIKE 'TEMP_%') as remaining_count;

-- Fix Item table TEMP_ erpIds (assign high numbers to avoid conflicts)
UPDATE "Item" 
SET "erpId" = CAST((10000 + CAST(SUBSTRING("erpId", 6) AS INTEGER)) AS TEXT)
WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Fixed Item TEMP_ erpIds' as status,
(SELECT COUNT(*) FROM "Item" WHERE "erpId" LIKE 'TEMP_%') as remaining_count;

-- Fix Vendor table TEMP_ erpIds (simple case, only 1 record)
UPDATE "Vendor" 
SET "erpId" = SUBSTRING("erpId", 6)  -- Remove 'TEMP_' prefix
WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Fixed Vendor TEMP_ erpIds' as status,
(SELECT COUNT(*) FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%') as remaining_count;

-- =====================================================
-- 2. Fix RUN# prefixes in BOM revisions
-- =====================================================

UPDATE "Bom" 
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g')
WHERE "bomRevision" LIKE 'RUN%';

SELECT 'Fixed RUN# prefixes in BOM revisions' as status,
(SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'RUN%') as remaining_count;

-- =====================================================
-- 3. Fix DELETE/DEL markers in BOM revisions
-- =====================================================

UPDATE "Bom" 
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '-DEL$', '', 'g')
WHERE "bomRevision" LIKE '%-DEL';

UPDATE "Bom" 
SET "bomRevision" = REGEXP_REPLACE("bomRevision", '-DELETE$', '', 'g')
WHERE "bomRevision" LIKE '%-DELETE';

SELECT 'Fixed DELETE markers in BOM revisions' as status,
(SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%-DEL%') as remaining_count;

-- =====================================================
-- 4. Fix negative BOM names
-- =====================================================

UPDATE "Bom" 
SET "bomName" = SUBSTRING("bomName", 2)  -- Remove leading '-'
WHERE "bomName" LIKE '-%';

SELECT 'Fixed negative BOM names' as status,
(SELECT COUNT(*) FROM "Bom" WHERE "bomName" LIKE '-%') as remaining_count;

-- =====================================================
-- 5. Fix RUN# prefixes in Recipe names
-- =====================================================

UPDATE "Recipe"
SET "Recipe" = REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g')
WHERE "Recipe" LIKE 'RUN%';

SELECT 'Fixed RUN# prefixes in Recipe names' as status,
(SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'RUN%') as remaining_count;

-- =====================================================
-- 6. Fix DELETE/DEL markers in Recipe names
-- =====================================================

UPDATE "Recipe"
SET "Recipe" = REGEXP_REPLACE("Recipe", '-DEL$', '', 'g')
WHERE "Recipe" LIKE '%-DEL';

UPDATE "Recipe"
SET "Recipe" = REGEXP_REPLACE("Recipe", '-DELETE$', '', 'g')
WHERE "Recipe" LIKE '%-DELETE';

SELECT 'Fixed DELETE markers in Recipe names' as status,
(SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%-DEL%') as remaining_count;

-- =====================================================
-- 7. Fix empty item names
-- =====================================================

UPDATE "Item" 
SET "itemName" = CASE
    WHEN "itemNumber" IS NOT NULL AND "itemNumber" <> '' THEN "itemNumber"
    WHEN "erpId" IS NOT NULL AND "erpId" <> '' THEN CONCAT('Item_', "erpId")
    ELSE CONCAT('Unnamed_Item_', id)
END
WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' ';

SELECT 'Fixed empty item names' as status,
(SELECT COUNT(*) FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' ') as remaining_count;

-- =====================================================
-- FINAL VERIFICATION
-- =====================================================

SELECT 'FINAL VERIFICATION' as step, NOW() as completed_at;

-- Check for remaining TEMP_ erpIds
SELECT 'Remaining TEMP_ erpIds in Bom' as check_type, COUNT(*) as count
FROM "Bom" WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Remaining TEMP_ erpIds in Item' as check_type, COUNT(*) as count
FROM "Item" WHERE "erpId" LIKE 'TEMP_%';

SELECT 'Remaining TEMP_ erpIds in Vendor' as check_type, COUNT(*) as count
FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%';

-- Check for remaining RUN# prefixes
SELECT 'Remaining RUN# prefixes in BOM revisions' as check_type, COUNT(*) as count
FROM "Bom" WHERE "bomRevision" LIKE 'RUN%';

SELECT 'Remaining RUN# prefixes in Recipe names' as check_type, COUNT(*) as count
FROM "Recipe" WHERE "Recipe" LIKE 'RUN%';

-- Check for remaining DELETE markers
SELECT 'Remaining DELETE markers in BOM revisions' as check_type, COUNT(*) as count
FROM "Bom" WHERE "bomRevision" LIKE '%-DEL%';

SELECT 'Remaining DELETE markers in Recipe names' as check_type, COUNT(*) as count
FROM "Recipe" WHERE "Recipe" LIKE '%-DEL%';

-- Check for remaining negative BOM names
SELECT 'Remaining negative BOM names' as check_type, COUNT(*) as count
FROM "Bom" WHERE "bomName" LIKE '-%';

-- Check for remaining empty item names
SELECT 'Remaining empty item names' as check_type, COUNT(*) as count
FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' ';

-- Review results above, then either COMMIT or ROLLBACK
-- If all verification checks show 0 remaining issues:
-- COMMIT;

-- If there are any issues:
-- ROLLBACK;

-- End of script 