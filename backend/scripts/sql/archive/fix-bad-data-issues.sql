-- WhiskeyHouse MES Database Bad Data Fixes
-- Script to address issues documented in bad-data-analysis.md

BEGIN;

-- Log the current timestamp for the start of the fix
SELECT NOW() AS "Fix Started At";

-- ============================================================================
-- 1. Fix Negative erpId Values
-- ============================================================================

DROP TABLE IF EXISTS "erp_id_changes";
-- Create a temporary table to log changes
CREATE TEMP TABLE erp_id_changes (
    table_name TEXT,
    record_id TEXT,
    record_name TEXT,
    old_erp_id TEXT,
    new_erp_id TEXT
);

-- 1.1. Fix Bom Table
WITH negative_erp_boms AS (
    SELECT id, "bomName", "erpId"
    FROM "Bom"
    WHERE "erpId" LIKE '-%'
),
bom_updates AS (
    UPDATE "Bom"
    SET "erpId" = 'TEMP_' || SUBSTRING("erpId", 2)
    WHERE id IN (SELECT id FROM negative_erp_boms)
    RETURNING id, "bomName", "erpId"
)
INSERT INTO erp_id_changes (table_name, record_id, record_name, old_erp_id, new_erp_id)
SELECT
    'Bom' AS table_name,
    bu.id AS record_id,
    bu."bomName" AS record_name,
    neb."erpId" AS old_erp_id,
    bu."erpId" AS new_erp_id
FROM bom_updates bu
JOIN negative_erp_boms neb ON bu.id = neb.id;

-- 1.2. Fix Item Table
WITH negative_erp_items AS (
    SELECT id, "itemName", "erpId"
    FROM "Item"
    WHERE "erpId" LIKE '-%'
),
item_updates AS (
    UPDATE "Item"
    SET "erpId" = 'TEMP_' || SUBSTRING("erpId", 2)
    WHERE id IN (SELECT id FROM negative_erp_items)
    RETURNING id, "itemName", "erpId"
)
INSERT INTO erp_id_changes (table_name, record_id, record_name, old_erp_id, new_erp_id)
SELECT
    'Item' AS table_name,
    iu.id AS record_id,
    iu."itemName" AS record_name,
    nei."erpId" AS old_erp_id,
    iu."erpId" AS new_erp_id
FROM item_updates iu
JOIN negative_erp_items nei ON iu.id = nei.id;

-- 1.3. Fix Vendor Table
WITH negative_erp_vendors AS (
    SELECT id, name, "erpId"
    FROM "Vendor"
    WHERE "erpId" LIKE '-%'
),
vendor_updates AS (
    UPDATE "Vendor"
    SET "erpId" = 'TEMP_' || SUBSTRING("erpId", 2)
    WHERE id IN (SELECT id FROM negative_erp_vendors)
    RETURNING id, name, "erpId"
)
INSERT INTO erp_id_changes (table_name, record_id, record_name, old_erp_id, new_erp_id)
SELECT
    'Vendor' AS table_name,
    vu.id AS record_id,
    vu.name AS record_name,
    nev."erpId" AS old_erp_id,
    vu."erpId" AS new_erp_id
FROM vendor_updates vu
JOIN negative_erp_vendors nev ON vu.id = nev.id;

-- ============================================================================
-- 2. Fix Empty Name Fields
-- ============================================================================
DROP TABLE IF EXISTS "empty_name_changes";
-- Create a temporary table to log changes for empty names
CREATE TEMP TABLE empty_name_changes (
    table_name TEXT,
    record_id TEXT,
    old_name TEXT,
    new_name TEXT
);

-- 2.1. Fix Item Table (Empty itemName)
WITH empty_name_items AS (
    SELECT
        id,
        "itemName",
        "itemNumber",
        "erpId"
    FROM "Item"
    WHERE "itemName" IN ('', ' ') OR "itemName" IS NULL
),
item_name_updates AS (
    UPDATE "Item"
    SET "itemName" = CASE
        WHEN eni."itemNumber" IS NOT NULL AND eni."itemNumber" <> '' THEN eni."itemNumber"
        WHEN eni."erpId" IS NOT NULL AND eni."erpId" <> '' THEN 'Item_' || eni."erpId"
        ELSE 'Unnamed_Item_' || eni.id
        END
    FROM empty_name_items eni
    WHERE "Item".id = eni.id
    RETURNING "Item".id, "Item"."itemName"
)
INSERT INTO empty_name_changes (table_name, record_id, old_name, new_name)
SELECT
    'Item' AS table_name,
    inu.id AS record_id,
    eni."itemName" AS old_name,
    inu."itemName" AS new_name
FROM item_name_updates inu
JOIN empty_name_items eni ON inu.id = eni.id;

-- ============================================================================
-- 3. Fix "DELETE ME" Markers
-- ============================================================================

DROP TABLE IF EXISTS "delete_marker_records";
-- Create a temporary table to log DELETE markers
CREATE TEMP TABLE delete_marker_records (
    table_name TEXT,
    record_id TEXT,
    record_name TEXT
);

-- 3.1. Identify Customer Table "DELETE ME" records
INSERT INTO delete_marker_records (table_name, record_id, record_name)
SELECT
    'Customer' AS table_name,
    id AS record_id,
    name AS record_name
FROM "Customer"
WHERE name LIKE 'DELETE ME%';

-- Option 1: Mark these records as inactive (if there's a status field)
-- Uncomment if you want to mark as inactive instead of deleting

/*
UPDATE "Customer"
SET "status" = 'INACTIVE'
WHERE name LIKE 'DELETE ME%';
*/

-- Option 2: Delete these records
-- Uncomment if you want to actually delete the records

/*
DELETE FROM "Customer"
WHERE name LIKE 'DELETE ME%';
*/

-- For now, we'll just log these records without taking action
SELECT * FROM delete_marker_records;

-- ============================================================================
-- Log Summary of Changes
-- ============================================================================

SELECT 'Negative erpId Values Fixed' AS fix_type, COUNT(*) AS record_count
FROM erp_id_changes;

SELECT 'Empty Name Fields Fixed' AS fix_type, COUNT(*) AS record_count
FROM empty_name_changes;

SELECT 'DELETE ME Markers Found' AS fix_type, COUNT(*) AS record_count
FROM delete_marker_records;

SELECT NOW() AS "Fix Completed At";

-- Review the specific changes
SELECT * FROM erp_id_changes ORDER BY table_name, record_id;
SELECT * FROM empty_name_changes ORDER BY table_name, record_id;
SELECT * FROM delete_marker_records ORDER BY table_name, record_id;

COMMIT;

-- =====================================================
-- BOM Duplicate Migration Script
-- =====================================================
-- This script migrates BOM items from duplicate BOM records
-- without ERP IDs to records with ERP IDs, then removes duplicates
-- =====================================================

-- Drop existing backup tables if they exist
DROP TABLE IF EXISTS "BomItem_backup_20250128";
DROP TABLE IF EXISTS "BomItem_backup_phase2_20250128";
DROP TABLE IF EXISTS "Bom_backup_20250128";

-- Create backup tables first
CREATE TABLE "Bom_backup_20250128" AS SELECT * FROM "Bom";
CREATE TABLE "BomItem_backup_20250128" AS SELECT * FROM "BomItem";

-- Start transaction for BOM migration
BEGIN;

-- =====================================================
-- STEP 1: Verify current state before migration
-- =====================================================
SELECT 'PRE-MIGRATION STATE' as step;

-- Count items that will be migrated
SELECT
    'Items to migrate' as check_type,
    COUNT(*) as count
FROM "BomItem" bi
JOIN "Bom" b ON bi."bomId" = b.id
WHERE b."erpId" IS NULL
AND b."bomRevision" IN (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
);

-- Count source BOMs that will be deleted
SELECT
    'Source BOMs to delete' as check_type,
    COUNT(*) as count
FROM "Bom" b
WHERE b."erpId" IS NULL
AND b."bomRevision" IN (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
);

-- =====================================================
-- STEP 2: Migrate ALL BOM Items to records with ERP IDs
-- =====================================================
SELECT 'STARTING BOM ITEM MIGRATION' as step;

-- Migrate 12 items from BOM-BGL-70-21-00-09 to 99 (ERP: 126)
UPDATE "BomItem" SET "bomId" = 'cm8pfp24b2wz0829skgdy85y5' WHERE "bomId" = 'cm60ejhok03zu116e3yrrp8z3';

-- Migrate 12 items from BOM-BRL-73-18-00-09 to 84 (ERP: 108)
UPDATE "BomItem" SET "bomId" = 'cm8pfoz6w2yx059r1fxm5axvc' WHERE "bomId" = 'cm3ny8n5q001ars2en778kz0k';

-- Migrate 12 items from BOM-CBI-00-95-00-05 to 79 (ERP: 103)
UPDATE "BomItem" SET "bomId" = 'cm8pfoxwc2ywv59r1wthfx0oq' WHERE "bomId" = 'cm3jc5yqu0017mgypi27v2r11';

-- Migrate 14 items from BOM-DBC-52-00-36-12 to 58 (ERP: 61)
UPDATE "BomItem" SET "bomId" = 'cm33cvq6000206xd9r1ow0z8u' WHERE "bomId" = 'cm1pb86bo0000eb6w7n3etbqv';

-- Migrate 12 items from BOM-DGI-60-36-00-04 to 73 (ERP: 76)
UPDATE "BomItem" SET "bomId" = 'cm8pfoxbl2ywr59r1ops5vo3d' WHERE "bomId" = 'cm2sho2an0001i6q6mg29tbpq';

-- Migrate 11 items from BOM-EJG-74-18-00-08 to 101 (ERP: 128)
UPDATE "BomItem" SET "bomId" = 'cm8pfp2rz2wz2829sjrnefsq9' WHERE "bomId" = 'cm5vu4nu40001qujq0ib02lb4';

-- Migrate 15 items from BOM-JBM-51-00-40-09 to 76 (ERP: 79)
UPDATE "BomItem" SET "bomId" = 'cm8pfoxd62ywt59r1mf7rc3ts' WHERE "bomId" = 'cm34h1vzw00098b1n29q1jqd4';

-- Migrate 13 items from BOM-OCD-64-00-24-12 to 92 (ERP: 119)
UPDATE "BomItem" SET "bomId" = 'cm8pfp0ns2yx759r1lx4o5r0d' WHERE "bomId" = 'cm4wyzm0p0fmhp72crhfosqr3';

-- Migrate 16 items from BOM-PAW-00-95-00-05 to 68 (ERP: 71)
UPDATE "BomItem" SET "bomId" = 'cm8pfow6s2wyp829sckakvxib' WHERE "bomId" = 'cm2o6o66w00015g48qon01qyf';

-- Migrate 17 items from BOM-PAW-60-36-00-04 to 70 (ERP: 73)
UPDATE "BomItem" SET "bomId" = 'cm8pfowe52wyq829suyhuw645' WHERE "bomId" = 'cm2p6yo1d0001sdsz5uasa36y';

-- Migrate 13 items from BOM-PAW-65-15-12-08 to 87 (ERP: 114)
UPDATE "BomItem" SET "bomId" = 'cm8pfp0492wyv829sdgs1mb7m' WHERE "bomId" = 'cm4hi5om3001wy2pwbklqf6b1';

-- Migrate 16 items from BOM-PAW-75-21-00-04 to 65 (ERP: 68)
UPDATE "BomItem" SET "bomId" = 'cm34z9c12003mergyikjr6jv6' WHERE "bomId" = 'cm2p41nat0001jxnsm36tr5ee';

-- Migrate 13 items from BOM-SBL-64-24-00-12 to 96 (ERP: 123)
UPDATE "BomItem" SET "bomId" = 'cm8pfp1gb2wyz829s424e1it6' WHERE "bomId" = 'cm4wzb9od0fttp72cxw3iqcdx';

-- Migrate 12 items from BOM-SBL-70-21-00-09 to 94 (ERP: 121)
UPDATE "BomItem" SET "bomId" = 'cm8pfp1372wyx829slpx0y6nf' WHERE "bomId" = 'cm4wz4fp80fqbp72cu2zafbnh';

-- Migrate 13 items from BOM-WSC-74-18-00-08 to 100 (ERP: 127)
UPDATE "BomItem" SET "bomId" = 'cm8pfp2f22wz1829sttcbys38' WHERE "bomId" = 'cm8d4uuco2cyc829sedar2nog';

-- Migrate 13 items from BOM-WTS-60-00-36-04 to 82 (ERP: 106)
UPDATE "BomItem" SET "bomId" = 'cm8pfoyl92ywy59r1qwpgrpg5' WHERE "bomId" = 'cm3mjk0f2001l1wjhbzghoq79';

-- Migrate 14 items from BOM-WTS-60-36-00-04 to 80 (ERP: 104)
UPDATE "BomItem" SET "bomId" = 'cm8pfoy7r2yww59r1ag7dqng6' WHERE "bomId" = 'cm3m9vtuu000113f1ftz81hbg';

SELECT 'BOM ITEM MIGRATION COMPLETED' as step;

-- =====================================================
-- STEP 3: Verify migration was successful
-- =====================================================
SELECT 'VERIFYING MIGRATION SUCCESS' as step;

-- Check that no BOM items still reference the source BOMs
SELECT
    'Items still referencing source BOMs' as check_type,
    COUNT(*) as count
FROM "BomItem" bi
WHERE bi."bomId" IN (
    'cm60ejhok03zu116e3yrrp8z3', 'cm3ny8n5q001ars2en778kz0k', 'cm3jc5yqu0017mgypi27v2r11',
    'cm1pb86bo0000eb6w7n3etbqv', 'cm2sho2an0001i6q6mg29tbpq', 'cm5vu4nu40001qujq0ib02lb4',
    'cm34h1vzw00098b1n29q1jqd4', 'cm4wyzm0p0fmhp72crhfosqr3', 'cm2o6o66w00015g48qon01qyf',
    'cm2p6yo1d0001sdsz5uasa36y', 'cm4hi5om3001wy2pwbklqf6b1', 'cm2p41nat0001jxnsm36tr5ee',
    'cm4wzb9od0fttp72cxw3iqcdx', 'cm4wz4fp80fqbp72cu2zafbnh', 'cm8d4uuco2cyc829sedar2nog',
    'cm3mjk0f2001l1wjhbzghoq79', 'cm3m9vtuu000113f1ftz81hbg'
);

-- If the above query returns 0, it's safe to proceed with deletions
-- If it returns > 0, DO NOT PROCEED - investigate the issue

-- =====================================================
-- STEP 4: Delete source BOM records (only if migration verified)
-- =====================================================
SELECT 'STARTING BOM RECORD DELETION' as step;

-- Remove BOM-BGL-70-21-00-09 (had 12 items before migration)
DELETE FROM "Bom" WHERE id = 'cm60ejhok03zu116e3yrrp8z3';

-- Remove BOM-BRL-73-18-00-09 (had 12 items before migration)
DELETE FROM "Bom" WHERE id = 'cm3ny8n5q001ars2en778kz0k';

-- Remove BOM-CBI-00-95-00-05 (had 12 items before migration)
DELETE FROM "Bom" WHERE id = 'cm3jc5yqu0017mgypi27v2r11';

-- Remove BOM-DBC-52-00-36-12 (had 14 items before migration)
DELETE FROM "Bom" WHERE id = 'cm1pb86bo0000eb6w7n3etbqv';

-- Remove BOM-DGI-60-36-00-04 (had 12 items before migration)
DELETE FROM "Bom" WHERE id = 'cm2sho2an0001i6q6mg29tbpq';

-- Remove BOM-EJG-74-18-00-08 (had 11 items before migration)
DELETE FROM "Bom" WHERE id = 'cm5vu4nu40001qujq0ib02lb4';

-- Remove BOM-JBM-51-00-40-09 (had 15 items before migration)
DELETE FROM "Bom" WHERE id = 'cm34h1vzw00098b1n29q1jqd4';

-- Remove BOM-OCD-64-00-24-12 (had 13 items before migration)
DELETE FROM "Bom" WHERE id = 'cm4wyzm0p0fmhp72crhfosqr3';

-- Remove BOM-PAW-00-95-00-05 (had 16 items before migration)
DELETE FROM "Bom" WHERE id = 'cm2o6o66w00015g48qon01qyf';

-- Remove BOM-PAW-60-36-00-04 (had 17 items before migration)
DELETE FROM "Bom" WHERE id = 'cm2p6yo1d0001sdsz5uasa36y';

-- Remove BOM-PAW-65-15-12-08 (had 13 items before migration)
DELETE FROM "Bom" WHERE id = 'cm4hi5om3001wy2pwbklqf6b1';

-- Remove BOM-PAW-75-21-00-04 (had 16 items before migration)
DELETE FROM "Bom" WHERE id = 'cm2p41nat0001jxnsm36tr5ee';

-- Remove BOM-SBL-64-24-00-12 (had 13 items before migration)
DELETE FROM "Bom" WHERE id = 'cm4wzb9od0fttp72cxw3iqcdx';

-- Remove BOM-SBL-70-21-00-09 (had 12 items before migration)
DELETE FROM "Bom" WHERE id = 'cm4wz4fp80fqbp72cu2zafbnh';

-- Remove BOM-WSC-74-18-00-08 (had 13 items before migration)
DELETE FROM "Bom" WHERE id = 'cm8d4uuco2cyc829sedar2nog';

-- Remove BOM-WTS-60-00-36-04 (had 13 items before migration)
DELETE FROM "Bom" WHERE id = 'cm3mjk0f2001l1wjhbzghoq79';

-- Remove BOM-WTS-60-36-00-04 (had 14 items before migration)
DELETE FROM "Bom" WHERE id = 'cm3m9vtuu000113f1ftz81hbg';

SELECT 'BOM RECORD DELETION COMPLETED' as step;

-- =====================================================
-- STEP 5: Final verification
-- =====================================================
SELECT 'FINAL VERIFICATION' as step;

-- Check for remaining duplicates (should be 0)
SELECT 'Remaining duplicates' as check_type, COUNT(*) as count
FROM (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- Check BOM items without valid BOM (should be 0)
SELECT 'Orphaned BOM items' as check_type, COUNT(*) as count
FROM "BomItem" bi
LEFT JOIN "Bom" b ON bi."bomId" = b.id
WHERE b.id IS NULL;

-- Check final counts
SELECT 'Final BOM count' as check_type, COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions
FROM "Bom";

-- Show summary of what was migrated
SELECT 'Migration summary' as check_type,
       '17 BOM records deleted, 225 BOM items migrated' as summary;

-- Review results above, then either COMMIT or ROLLBACK
-- If all verification checks show expected results (0 duplicates, 0 orphaned items, 125 total BOMs):
-- COMMIT;

-- If there are any issues:
-- ROLLBACK;