-- Master script for fixing all bad data issues
-- Based on bad-data-analysis.md findings

/*
INSTRUCTIONS:

This file provides guidance on the order to run the bad data fix scripts.
Each script has its own transaction control for safety.

Execute the following scripts in this order:

1. fix-order-null-names-pg.sql
   - Fixes NULL names in ProductionOrder and ScheduleOrder tables
   - Creates consistent naming pattern: PROYYYJJJNNN or SHOYYYJJJNNN

2. fix-bad-data-issues.sql  
   - Fixes negative erpId values in Bom, Item, and Vendor tables
   - Fixes empty name fields in Item table
   - Identifies "DELETE ME" markers in Customer table

For PostgreSQL:
- Run each script individually using psql or your preferred DB tool
- Example: psql -U username -d database_name -f fix-order-null-names-pg.sql

For SQL Server:
- Use the SQL Server-specific scripts (fix-order-null-names.sql)
- Run via SQL Server Management Studio or sqlcmd
- Example: sqlcmd -S server_name -d database_name -i fix-order-null-names.sql

Review the output of each script to verify the changes made.
*/

-- Start timestamp
SELECT GETDATE() AS "Bad Data Fix Started";

-- This script calls individual fix scripts in sequence
-- Each script has its own transaction control to ensure stability

-- 1. Fix ProductionOrder and ScheduleOrder NULL names
:r fix-order-null-names-pg.sql

-- 2. Fix other bad data issues (negative erpIds, empty names, DELETE markers)
:r fix-bad-data-issues.sql

-- End timestamp
SELECT GETDATE() AS "Bad Data Fix Completed";

-- Summary of all changes
-- Note: This requires the logging tables to persist across scripts
-- Alternatively, you can review logs from each individual script execution 

-- =====================================================
-- BOM Duplicate Migration - EXECUTABLE SCRIPT
-- =====================================================
-- This script migrates BOM items from duplicate BOM records
-- without ERP IDs to records with ERP IDs, then removes duplicates
-- =====================================================

-- Create backup tables first
CREATE TABLE "Bom_backup_20250128" AS SELECT * FROM "Bom";
CREATE TABLE "BomItem_backup_20250128" AS SELECT * FROM "BomItem";

-- Start transaction
BEGIN;

-- =====================================================
-- STEP 1: Migrate BOM Items to records with ERP IDs
-- =====================================================

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

-- =====================================================
-- STEP 2: Delete the old BOM records (without ERP IDs)
-- =====================================================

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

-- =====================================================
-- STEP 3: Verification
-- =====================================================

-- Check for remaining duplicates (should be 0)
SELECT 'Remaining duplicates:' as check_type, COUNT(*) as count
FROM (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- Check BOM items without valid BOM (should be 0)
SELECT 'Orphaned BOM items:' as check_type, COUNT(*) as count
FROM "BomItem" bi 
LEFT JOIN "Bom" b ON bi."bomId" = b.id 
WHERE b.id IS NULL;

-- Check final counts
SELECT 'Final BOM count:' as check_type, COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions 
FROM "Bom";

-- Show summary of what was migrated
SELECT 'Migration summary:' as check_type, 
       '17 BOM records deleted, 225 BOM items migrated' as summary;

-- If all verification checks pass, commit the transaction
-- COMMIT;

-- If there are any issues, rollback instead:
-- ROLLBACK; 