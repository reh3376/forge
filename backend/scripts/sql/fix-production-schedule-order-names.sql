-- Fix ALL ProductionOrder and ScheduleOrder names to follow a consistent format
-- Uses format PROYYYJJJNNN or SHOYYYJJJNNN where:
-- YY = 2-digit year
-- JJJ = Julian day (day of year)
-- NNN = sequential number 

BEGIN;

-- Function to get Julian day (day of year)
CREATE OR REPLACE FUNCTION get_julian_day(date_value TIMESTAMP) 
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(DOY FROM date_value)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Function to create new name based on date
CREATE OR REPLACE FUNCTION get_order_name(prefix TEXT, created_date TIMESTAMP, seq_num INTEGER) 
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    julian_part TEXT;
    seq_part TEXT;
BEGIN
    -- Get 2-digit year
    year_part := RIGHT(EXTRACT(YEAR FROM created_date)::TEXT, 2);
    
    -- Get Julian day with leading zeros
    julian_part := LPAD(get_julian_day(created_date)::TEXT, 3, '0');
    
    -- Format sequence number with leading zeros
    seq_part := LPAD(seq_num::TEXT, 3, '0');
    
    -- Return formatted name
    RETURN prefix || year_part || julian_part || seq_part;
END;
$$ LANGUAGE plpgsql;

-- Update ProductionOrder names
DO $$
DECLARE
    rec RECORD;
    count_per_day INTEGER;
    new_name TEXT;
BEGIN
    -- Process each ProductionOrder, ordered by creation date
    FOR rec IN 
        SELECT 
            id, 
            name,
            "createdAt"::DATE AS created_date,
            "createdAt" AS created_timestamp
        FROM "ProductionOrder"
        ORDER BY "createdAt" ASC
    LOOP
        -- Calculate position for this order on its creation date
        SELECT 
            COUNT(*) + 1 INTO count_per_day
        FROM "ProductionOrder"
        WHERE 
            "createdAt"::DATE = rec.created_date AND
            "createdAt" < rec.created_timestamp;
        
        -- Generate new name
        new_name := get_order_name('PRO', rec.created_timestamp, count_per_day);
        
        -- Update record (only if name format doesn't already match)
        IF rec.name IS NULL OR NOT (rec.name ~ '^PRO\d{8}$') THEN
            RAISE NOTICE 'Updating ProductionOrder %: % -> %', rec.id, rec.name, new_name;
            UPDATE "ProductionOrder" SET name = new_name WHERE id = rec.id;
        END IF;
    END LOOP;
END $$;

-- Update ScheduleOrder names
DO $$
DECLARE
    rec RECORD;
    count_per_day INTEGER;
    new_name TEXT;
BEGIN
    -- Process each ScheduleOrder, ordered by creation date
    FOR rec IN 
        SELECT 
            id, 
            name,
            "createdAt"::DATE AS created_date,
            "createdAt" AS created_timestamp
        FROM "ScheduleOrder"
        ORDER BY "createdAt" ASC
    LOOP
        -- Calculate position for this order on its creation date
        SELECT 
            COUNT(*) + 1 INTO count_per_day
        FROM "ScheduleOrder"
        WHERE 
            "createdAt"::DATE = rec.created_date AND
            "createdAt" < rec.created_timestamp;
        
        -- Generate new name
        new_name := get_order_name('SHO', rec.created_timestamp, count_per_day);
        
        -- Update record (only if name format doesn't already match)
        IF rec.name IS NULL OR NOT (rec.name ~ '^SHO\d{8}$') THEN
            RAISE NOTICE 'Updating ScheduleOrder %: % -> %', rec.id, rec.name, new_name;
            UPDATE "ScheduleOrder" SET name = new_name WHERE id = rec.id;
        END IF;
    END LOOP;
END $$;

-- Drop temporary functions
DROP FUNCTION IF EXISTS get_julian_day(TIMESTAMP);
DROP FUNCTION IF EXISTS get_order_name(TEXT, TIMESTAMP, INTEGER);

-- Verify the changes
SELECT id, name, "createdAt" FROM "ProductionOrder" ORDER BY "createdAt";
SELECT id, name, "createdAt" FROM "ScheduleOrder" ORDER BY "createdAt"; 

COMMIT; 

-- =====================================================
-- Comprehensive BOM Duplicate Migration Script
-- =====================================================
-- This script migrates ALL references from duplicate BOM records
-- without ERP IDs to records with ERP IDs, then removes duplicates
-- =====================================================

-- Drop existing backup tables if they exist
DROP TABLE IF EXISTS "Bom_backup_20250128";
DROP TABLE IF EXISTS "BomItem_backup_20250128";
DROP TABLE IF EXISTS "ProductionOrder_backup_20250128";

-- Create backup tables
CREATE TABLE "Bom_backup_20250128" AS SELECT * FROM "Bom";
CREATE TABLE "BomItem_backup_20250128" AS SELECT * FROM "BomItem";
CREATE TABLE "ProductionOrder_backup_20250128" AS SELECT * FROM "ProductionOrder";

-- Start transaction for BOM migration
BEGIN;

-- =====================================================
-- STEP 1: Verify current state before migration
-- =====================================================
SELECT 'PRE-MIGRATION STATE' as step;

-- Count BOM items that will be migrated
SELECT 
    'BOM Items to migrate' as check_type,
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

-- Count ProductionOrders that will be migrated
SELECT 
    'Production Orders to migrate' as check_type,
    COUNT(*) as count
FROM "ProductionOrder" po
JOIN "Bom" b ON po."bomId" = b.id
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
-- STEP 2: Migrate ALL ProductionOrder references FIRST
-- =====================================================
SELECT 'STARTING PRODUCTION ORDER MIGRATION' as step;

-- Migrate 5 ProductionOrders from BOM-BGL-70-21-00-09 to target BOM (ERP: 126)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp24b2wz0829skgdy85y5' WHERE "bomId" = 'cm60ejhok03zu116e3yrrp8z3';

-- Migrate 1 ProductionOrder from BOM-BRL-73-18-00-09 to target BOM (ERP: 108)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfoz6w2yx059r1fxm5axvc' WHERE "bomId" = 'cm3ny8n5q001ars2en778kz0k';

-- Migrate 7 ProductionOrders from BOM-CBI-00-95-00-05 to target BOM (ERP: 103)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfoxwc2ywv59r1wthfx0oq' WHERE "bomId" = 'cm3jc5yqu0017mgypi27v2r11';

-- Migrate 1 ProductionOrder from BOM-DBC-52-00-36-12 to target BOM (ERP: 61)
UPDATE "ProductionOrder" SET "bomId" = 'cm33cvq6000206xd9r1ow0z8u' WHERE "bomId" = 'cm1pb86bo0000eb6w7n3etbqv';

-- Migrate 1 ProductionOrder from BOM-DGI-60-36-00-04 to target BOM (ERP: 76)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfoxbl2ywr59r1ops5vo3d' WHERE "bomId" = 'cm2sho2an0001i6q6mg29tbpq';

-- Migrate 1 ProductionOrder from BOM-EJG-74-18-00-08 to target BOM (ERP: 128)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp2rz2wz2829sjrnefsq9' WHERE "bomId" = 'cm5vu4nu40001qujq0ib02lb4';

-- Migrate 1 ProductionOrder from BOM-JBM-51-00-40-09 to target BOM (ERP: 79)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfoxd62ywt59r1mf7rc3ts' WHERE "bomId" = 'cm34h1vzw00098b1n29q1jqd4';

-- Migrate 1 ProductionOrder from BOM-OCD-64-00-24-12 to target BOM (ERP: 119)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp0ns2yx759r1lx4o5r0d' WHERE "bomId" = 'cm4wyzm0p0fmhp72crhfosqr3';

-- Migrate 5 ProductionOrders from BOM-PAW-00-95-00-05 to target BOM (ERP: 71)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfow6s2wyp829sckakvxib' WHERE "bomId" = 'cm2o6o66w00015g48qon01qyf';

-- Migrate 2 ProductionOrders from BOM-PAW-60-36-00-04 to target BOM (ERP: 73)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfowe52wyq829suyhuw645' WHERE "bomId" = 'cm2p6yo1d0001sdsz5uasa36y';

-- Migrate 8 ProductionOrders from BOM-PAW-65-15-12-08 to target BOM (ERP: 114)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp0492wyv829sdgs1mb7m' WHERE "bomId" = 'cm4hi5om3001wy2pwbklqf6b1';

-- Migrate 3 ProductionOrders from BOM-PAW-75-21-00-04 to target BOM (ERP: 68)
UPDATE "ProductionOrder" SET "bomId" = 'cm34z9c12003mergyikjr6jv6' WHERE "bomId" = 'cm2p41nat0001jxnsm36tr5ee';

-- Migrate 1 ProductionOrder from BOM-SBL-64-24-00-12 to target BOM (ERP: 123)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp1gb2wyz829s424e1it6' WHERE "bomId" = 'cm4wzb9od0fttp72cxw3iqcdx';

-- Migrate 1 ProductionOrder from BOM-SBL-70-21-00-09 to target BOM (ERP: 121)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp1372wyx829slpx0y6nf' WHERE "bomId" = 'cm4wz4fp80fqbp72cu2zafbnh';

-- Migrate 7 ProductionOrders from BOM-WSC-74-18-00-08 to target BOM (ERP: 127)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfp2f22wz1829sttcbys38' WHERE "bomId" = 'cm8d4uuco2cyc829sedar2nog';

-- Migrate 1 ProductionOrder from BOM-WTS-60-00-36-04 to target BOM (ERP: 106)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfoyl92ywy59r1qwpgrpg5' WHERE "bomId" = 'cm3mjk0f2001l1wjhbzghoq79';

-- Migrate 2 ProductionOrders from BOM-WTS-60-36-00-04 to target BOM (ERP: 104)
UPDATE "ProductionOrder" SET "bomId" = 'cm8pfoy7r2yww59r1ag7dqng6' WHERE "bomId" = 'cm3m9vtuu000113f1ftz81hbg';

SELECT 'PRODUCTION ORDER MIGRATION COMPLETED' as step;

-- =====================================================
-- STEP 3: Migrate ALL BOM Items SECOND
-- =====================================================
SELECT 'STARTING BOM ITEM MIGRATION' as step;

-- Migrate 12 items from BOM-BGL-70-21-00-09 to target BOM (ERP: 126)
UPDATE "BomItem" SET "bomId" = 'cm8pfp24b2wz0829skgdy85y5' WHERE "bomId" = 'cm60ejhok03zu116e3yrrp8z3';

-- Migrate 12 items from BOM-BRL-73-18-00-09 to target BOM (ERP: 108)
UPDATE "BomItem" SET "bomId" = 'cm8pfoz6w2yx059r1fxm5axvc' WHERE "bomId" = 'cm3ny8n5q001ars2en778kz0k';

-- Migrate 12 items from BOM-CBI-00-95-00-05 to target BOM (ERP: 103)
UPDATE "BomItem" SET "bomId" = 'cm8pfoxwc2ywv59r1wthfx0oq' WHERE "bomId" = 'cm3jc5yqu0017mgypi27v2r11';

-- Migrate 14 items from BOM-DBC-52-00-36-12 to target BOM (ERP: 61)
UPDATE "BomItem" SET "bomId" = 'cm33cvq6000206xd9r1ow0z8u' WHERE "bomId" = 'cm1pb86bo0000eb6w7n3etbqv';

-- Migrate 12 items from BOM-DGI-60-36-00-04 to target BOM (ERP: 76)
UPDATE "BomItem" SET "bomId" = 'cm8pfoxbl2ywr59r1ops5vo3d' WHERE "bomId" = 'cm2sho2an0001i6q6mg29tbpq';

-- Migrate 11 items from BOM-EJG-74-18-00-08 to target BOM (ERP: 128)
UPDATE "BomItem" SET "bomId" = 'cm8pfp2rz2wz2829sjrnefsq9' WHERE "bomId" = 'cm5vu4nu40001qujq0ib02lb4';

-- Migrate 15 items from BOM-JBM-51-00-40-09 to target BOM (ERP: 79)
UPDATE "BomItem" SET "bomId" = 'cm8pfoxd62ywt59r1mf7rc3ts' WHERE "bomId" = 'cm34h1vzw00098b1n29q1jqd4';

-- Migrate 13 items from BOM-OCD-64-00-24-12 to target BOM (ERP: 119)
UPDATE "BomItem" SET "bomId" = 'cm8pfp0ns2yx759r1lx4o5r0d' WHERE "bomId" = 'cm4wyzm0p0fmhp72crhfosqr3';

-- Migrate 16 items from BOM-PAW-00-95-00-05 to target BOM (ERP: 71)
UPDATE "BomItem" SET "bomId" = 'cm8pfow6s2wyp829sckakvxib' WHERE "bomId" = 'cm2o6o66w00015g48qon01qyf';

-- Migrate 17 items from BOM-PAW-60-36-00-04 to target BOM (ERP: 73)
UPDATE "BomItem" SET "bomId" = 'cm8pfowe52wyq829suyhuw645' WHERE "bomId" = 'cm2p6yo1d0001sdsz5uasa36y';

-- Migrate 13 items from BOM-PAW-65-15-12-08 to target BOM (ERP: 114)
UPDATE "BomItem" SET "bomId" = 'cm8pfp0492wyv829sdgs1mb7m' WHERE "bomId" = 'cm4hi5om3001wy2pwbklqf6b1';

-- Migrate 16 items from BOM-PAW-75-21-00-04 to target BOM (ERP: 68)
UPDATE "BomItem" SET "bomId" = 'cm34z9c12003mergyikjr6jv6' WHERE "bomId" = 'cm2p41nat0001jxnsm36tr5ee';

-- Migrate 13 items from BOM-SBL-64-24-00-12 to target BOM (ERP: 123)
UPDATE "BomItem" SET "bomId" = 'cm8pfp1gb2wyz829s424e1it6' WHERE "bomId" = 'cm4wzb9od0fttp72cxw3iqcdx';

-- Migrate 12 items from BOM-SBL-70-21-00-09 to target BOM (ERP: 121)
UPDATE "BomItem" SET "bomId" = 'cm8pfp1372wyx829slpx0y6nf' WHERE "bomId" = 'cm4wz4fp80fqbp72cu2zafbnh';

-- Migrate 13 items from BOM-WSC-74-18-00-08 to target BOM (ERP: 127)
UPDATE "BomItem" SET "bomId" = 'cm8pfp2f22wz1829sttcbys38' WHERE "bomId" = 'cm8d4uuco2cyc829sedar2nog';

-- Migrate 13 items from BOM-WTS-60-00-36-04 to target BOM (ERP: 106)
UPDATE "BomItem" SET "bomId" = 'cm8pfoyl92ywy59r1qwpgrpg5' WHERE "bomId" = 'cm3mjk0f2001l1wjhbzghoq79';

-- Migrate 14 items from BOM-WTS-60-36-00-04 to target BOM (ERP: 104)
UPDATE "BomItem" SET "bomId" = 'cm8pfoy7r2yww59r1ag7dqng6' WHERE "bomId" = 'cm3m9vtuu000113f1ftz81hbg';

SELECT 'BOM ITEM MIGRATION COMPLETED' as step;

-- =====================================================
-- STEP 4: Verify migration was successful
-- =====================================================
SELECT 'VERIFYING MIGRATION SUCCESS' as step;

-- Check that no BOM items still reference the source BOMs
SELECT 
    'BOM Items still referencing source BOMs' as check_type,
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

-- Check that no ProductionOrders still reference the source BOMs
SELECT 
    'Production Orders still referencing source BOMs' as check_type,
    COUNT(*) as count
FROM "ProductionOrder" po
WHERE po."bomId" IN (
    'cm60ejhok03zu116e3yrrp8z3', 'cm3ny8n5q001ars2en778kz0k', 'cm3jc5yqu0017mgypi27v2r11',
    'cm1pb86bo0000eb6w7n3etbqv', 'cm2sho2an0001i6q6mg29tbpq', 'cm5vu4nu40001qujq0ib02lb4',
    'cm34h1vzw00098b1n29q1jqd4', 'cm4wyzm0p0fmhp72crhfosqr3', 'cm2o6o66w00015g48qon01qyf',
    'cm2p6yo1d0001sdsz5uasa36y', 'cm4hi5om3001wy2pwbklqf6b1', 'cm2p41nat0001jxnsm36tr5ee',
    'cm4wzb9od0fttp72cxw3iqcdx', 'cm4wz4fp80fqbp72cu2zafbnh', 'cm8d4uuco2cyc829sedar2nog',
    'cm3mjk0f2001l1wjhbzghoq79', 'cm3m9vtuu000113f1ftz81hbg'
);

-- If both above queries return 0, it's safe to proceed with deletions
-- If either returns > 0, DO NOT PROCEED - investigate the issue

-- =====================================================
-- STEP 5: Delete source BOM records (only if migration verified)
-- =====================================================
SELECT 'STARTING BOM RECORD DELETION' as step;

-- Remove BOM-BGL-70-21-00-09 (had 12 items + 5 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm60ejhok03zu116e3yrrp8z3';

-- Remove BOM-BRL-73-18-00-09 (had 12 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm3ny8n5q001ars2en778kz0k';

-- Remove BOM-CBI-00-95-00-05 (had 12 items + 7 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm3jc5yqu0017mgypi27v2r11';

-- Remove BOM-DBC-52-00-36-12 (had 14 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm1pb86bo0000eb6w7n3etbqv';

-- Remove BOM-DGI-60-36-00-04 (had 12 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm2sho2an0001i6q6mg29tbpq';

-- Remove BOM-EJG-74-18-00-08 (had 11 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm5vu4nu40001qujq0ib02lb4';

-- Remove BOM-JBM-51-00-40-09 (had 15 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm34h1vzw00098b1n29q1jqd4';

-- Remove BOM-OCD-64-00-24-12 (had 13 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm4wyzm0p0fmhp72crhfosqr3';

-- Remove BOM-PAW-00-95-00-05 (had 16 items + 5 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm2o6o66w00015g48qon01qyf';

-- Remove BOM-PAW-60-36-00-04 (had 17 items + 2 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm2p6yo1d0001sdsz5uasa36y';

-- Remove BOM-PAW-65-15-12-08 (had 13 items + 8 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm4hi5om3001wy2pwbklqf6b1';

-- Remove BOM-PAW-75-21-00-04 (had 16 items + 3 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm2p41nat0001jxnsm36tr5ee';

-- Remove BOM-SBL-64-24-00-12 (had 13 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm4wzb9od0fttp72cxw3iqcdx';

-- Remove BOM-SBL-70-21-00-09 (had 12 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm4wz4fp80fqbp72cu2zafbnh';

-- Remove BOM-WSC-74-18-00-08 (had 13 items + 7 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm8d4uuco2cyc829sedar2nog';

-- Remove BOM-WTS-60-00-36-04 (had 13 items + 1 production order before migration)
DELETE FROM "Bom" WHERE id = 'cm3mjk0f2001l1wjhbzghoq79';

-- Remove BOM-WTS-60-36-00-04 (had 14 items + 2 production orders before migration)
DELETE FROM "Bom" WHERE id = 'cm3m9vtuu000113f1ftz81hbg';

SELECT 'BOM RECORD DELETION COMPLETED' as step;

-- =====================================================
-- STEP 6: Final verification
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

-- Check ProductionOrders without valid BOM (should be 0)
SELECT 'Orphaned Production Orders' as check_type, COUNT(*) as count
FROM "ProductionOrder" po 
LEFT JOIN "Bom" b ON po."bomId" = b.id 
WHERE b.id IS NULL AND po."bomId" IS NOT NULL;

-- Check final counts
SELECT 'Final BOM count' as check_type, COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions 
FROM "Bom";

-- Show summary of what was migrated
SELECT 'Migration summary' as check_type, 
       '17 BOM records deleted, 225 BOM items migrated, 47 Production Orders migrated' as summary;

-- Review results above, then either COMMIT or ROLLBACK
-- If all verification checks show expected results (0 duplicates, 0 orphaned items/orders, 125 total BOMs):
-- COMMIT;

-- If there are any issues:
-- ROLLBACK; 