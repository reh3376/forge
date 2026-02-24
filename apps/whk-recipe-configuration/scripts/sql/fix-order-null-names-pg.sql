-- =====================================================
-- BOM Duplicate Migration Script - Phase 2
-- =====================================================
-- This script migrates remaining duplicate BOM records
-- from TEMP_ ERP IDs to real numeric ERP IDs
-- =====================================================

-- Drop existing backup tables if they exist
DROP TABLE IF EXISTS "Bom_backup_phase2_20250128";
DROP TABLE IF EXISTS "BomItem_backup_phase2_20250128";
DROP TABLE IF EXISTS "ProductionOrder_backup_phase2_20250128";

-- Create backup tables
CREATE TABLE "Bom_backup_phase2_20250128" AS SELECT * FROM "Bom";
CREATE TABLE "BomItem_backup_phase2_20250128" AS SELECT * FROM "BomItem";
CREATE TABLE "ProductionOrder_backup_phase2_20250128" AS SELECT * FROM "ProductionOrder";

-- Start transaction for BOM migration
BEGIN;

-- =====================================================
-- STEP 1: Verify current state before migration
-- =====================================================
SELECT 'PRE-MIGRATION STATE - PHASE 2' as step;

-- Count remaining duplicates
SELECT 
    'Remaining duplicate BOM revisions' as check_type,
    COUNT(*) as count
FROM (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- =====================================================
-- STEP 2: Migrate ProductionOrder references FIRST
-- =====================================================
SELECT 'STARTING PRODUCTION ORDER MIGRATION - PHASE 2' as step;

-- Migrate 224 ProductionOrders from BOM-FDP-78-10-00-12-R01 (TEMP_20) to target BOM (ERP: 38)
UPDATE "ProductionOrder" SET "bomId" = 'cm1triu15075r14eo1edsmdtm' WHERE "bomId" = 'cm0h8e46r00020cl8316a9vk7';

-- Migrate 11 ProductionOrders from BOM-GSC-00-95-00-05-R01 (TEMP_27) to target BOM (ERP: 45)
UPDATE "ProductionOrder" SET "bomId" = 'cm1z8pnro0kz9enokmsdkg7oc' WHERE "bomId" = 'cm1oiiuz800010cmkhxvieso3';

-- Migrate 13 ProductionOrders from BOM-LQD-60-00-36-04-R01 (TEMP_15) to target BOM (ERP: 33)
UPDATE "ProductionOrder" SET "bomId" = 'cm1gr68io0252aek5vll2ecw2' WHERE "bomId" = 'clyyl1jar0007qqbjn7mnjm3h';

-- Migrate 12 ProductionOrders from BOM-LQD-75-21-00-04-R01 (TEMP_13) to target BOM (ERP: 29)
UPDATE "ProductionOrder" SET "bomId" = 'cm16ty1up0cn8ba9i5e0h6m01' WHERE "bomId" = 'clyyl1jar0007qqbin7mnjl3h';

-- Migrate 13 ProductionOrders from BOM-LSS-73-18-00-09-R01 (TEMP_22) to target BOM (ERP: 42)
UPDATE "ProductionOrder" SET "bomId" = 'cm1uv6aqv0a76enokw833ia4y' WHERE "bomId" = 'cm0vtqg2l00010cl89zw06wb8';

-- Migrate 12 ProductionOrders from BOM-OTS-75-21-00-04-R01 (TEMP_23) to target BOM (ERP: 40)
UPDATE "ProductionOrder" SET "bomId" = 'cm1tslgab07k0enok7w7vyux0' WHERE "bomId" = 'cm0vtqg2l00020cl8fpex9luf';

-- Migrate 14 ProductionOrders from BOM-OTS-80-10-00-10-R01 (TEMP_24) to target BOM (ERP: 41)
UPDATE "ProductionOrder" SET "bomId" = 'cm1ut15y209qd14eoihey2m8e' WHERE "bomId" = 'cm0vtqg2l00030cl8huki8mcf';

-- Note: BOM-WHK-75-21-00-04-R01 has two records with real ERP IDs (46, 56) but no data in either
-- We'll keep the one with ERP ID 56 and delete the one with ERP ID 46

SELECT 'PRODUCTION ORDER MIGRATION COMPLETED - PHASE 2' as step;

-- =====================================================
-- STEP 3: Migrate BOM Items SECOND
-- =====================================================
SELECT 'STARTING BOM ITEM MIGRATION - PHASE 2' as step;

-- Migrate 224 items from BOM-FDP-78-10-00-12-R01 (TEMP_20) to target BOM (ERP: 38)
UPDATE "BomItem" SET "bomId" = 'cm1triu15075r14eo1edsmdtm' WHERE "bomId" = 'cm0h8e46r00020cl8316a9vk7';

-- Migrate 11 items from BOM-GSC-00-95-00-05-R01 (TEMP_27) to target BOM (ERP: 45)
UPDATE "BomItem" SET "bomId" = 'cm1z8pnro0kz9enokmsdkg7oc' WHERE "bomId" = 'cm1oiiuz800010cmkhxvieso3';

-- Migrate 13 items from BOM-LQD-60-00-36-04-R01 (TEMP_15) to target BOM (ERP: 33)
UPDATE "BomItem" SET "bomId" = 'cm1gr68io0252aek5vll2ecw2' WHERE "bomId" = 'clyyl1jar0007qqbjn7mnjm3h';

-- Migrate 12 items from BOM-LQD-75-21-00-04-R01 (TEMP_13) to target BOM (ERP: 29)
UPDATE "BomItem" SET "bomId" = 'cm16ty1up0cn8ba9i5e0h6m01' WHERE "bomId" = 'clyyl1jar0007qqbin7mnjl3h';

-- Migrate 13 items from BOM-LSS-73-18-00-09-R01 (TEMP_22) to target BOM (ERP: 42)
UPDATE "BomItem" SET "bomId" = 'cm1uv6aqv0a76enokw833ia4y' WHERE "bomId" = 'cm0vtqg2l00010cl89zw06wb8';

-- Migrate 12 items from BOM-OTS-75-21-00-04-R01 (TEMP_23) to target BOM (ERP: 40)
UPDATE "BomItem" SET "bomId" = 'cm1tslgab07k0enok7w7vyux0' WHERE "bomId" = 'cm0vtqg2l00020cl8fpex9luf';

-- Migrate 14 items from BOM-OTS-80-10-00-10-R01 (TEMP_24) to target BOM (ERP: 41)
UPDATE "BomItem" SET "bomId" = 'cm1ut15y209qd14eoihey2m8e' WHERE "bomId" = 'cm0vtqg2l00030cl8huki8mcf';

-- Note: BOM-WHK-75-21-00-04-R01 has no BOM items to migrate

SELECT 'BOM ITEM MIGRATION COMPLETED - PHASE 2' as step;

-- =====================================================
-- STEP 4: Verify migration was successful
-- =====================================================
SELECT 'VERIFYING MIGRATION SUCCESS - PHASE 2' as step;

-- Check that no BOM items still reference the source BOMs
SELECT 
    'BOM Items still referencing TEMP source BOMs' as check_type,
    COUNT(*) as count
FROM "BomItem" bi
WHERE bi."bomId" IN (
    'cm0h8e46r00020cl8316a9vk7', 'cm1oiiuz800010cmkhxvieso3', 'clyyl1jar0007qqbjn7mnjm3h',
    'clyyl1jar0007qqbin7mnjl3h', 'cm0vtqg2l00010cl89zw06wb8', 'cm0vtqg2l00020cl8fpex9luf',
    'cm0vtqg2l00030cl8huki8mcf'
);

-- Check that no ProductionOrders still reference the source BOMs
SELECT 
    'Production Orders still referencing TEMP source BOMs' as check_type,
    COUNT(*) as count
FROM "ProductionOrder" po
WHERE po."bomId" IN (
    'cm0h8e46r00020cl8316a9vk7', 'cm1oiiuz800010cmkhxvieso3', 'clyyl1jar0007qqbjn7mnjm3h',
    'clyyl1jar0007qqbin7mnjl3h', 'cm0vtqg2l00010cl89zw06wb8', 'cm0vtqg2l00020cl8fpex9luf',
    'cm0vtqg2l00030cl8huki8mcf'
);

-- If both above queries return 0, it's safe to proceed with deletions

-- =====================================================
-- STEP 5: Delete source BOM records (only if migration verified)
-- =====================================================
SELECT 'STARTING BOM RECORD DELETION - PHASE 2' as step;

-- Remove BOM-FDP-78-10-00-12-R01 with TEMP_20 (had 224 items + 224 production orders)
DELETE FROM "Bom" WHERE id = 'cm0h8e46r00020cl8316a9vk7';

-- Remove BOM-GSC-00-95-00-05-R01 with TEMP_27 (had 11 items + 11 production orders)
DELETE FROM "Bom" WHERE id = 'cm1oiiuz800010cmkhxvieso3';

-- Remove BOM-LQD-60-00-36-04-R01 with TEMP_15 (had 13 items + 13 production orders)
DELETE FROM "Bom" WHERE id = 'clyyl1jar0007qqbjn7mnjm3h';

-- Remove BOM-LQD-75-21-00-04-R01 with TEMP_13 (had 12 items + 12 production orders)
DELETE FROM "Bom" WHERE id = 'clyyl1jar0007qqbin7mnjl3h';

-- Remove BOM-LSS-73-18-00-09-R01 with TEMP_22 (had 13 items + 13 production orders)
DELETE FROM "Bom" WHERE id = 'cm0vtqg2l00010cl89zw06wb8';

-- Remove BOM-OTS-75-21-00-04-R01 with TEMP_23 (had 12 items + 12 production orders)
DELETE FROM "Bom" WHERE id = 'cm0vtqg2l00020cl8fpex9luf';

-- Remove BOM-OTS-80-10-00-10-R01 with TEMP_24 (had 14 items + 14 production orders)
DELETE FROM "Bom" WHERE id = 'cm0vtqg2l00030cl8huki8mcf';

-- Remove one of the duplicate BOM-WHK-75-21-00-04-R01 records (keep ERP: 56, delete ERP: 46)
DELETE FROM "Bom" WHERE id = 'cm20p83g400ewb4c6a7kxdtj1';

SELECT 'BOM RECORD DELETION COMPLETED - PHASE 2' as step;

-- =====================================================
-- STEP 6: Final verification
-- =====================================================
SELECT 'FINAL VERIFICATION - PHASE 2' as step;

-- Check for remaining duplicates (should be 0)
SELECT 'Remaining duplicates after Phase 2' as check_type, COUNT(*) as count
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
SELECT 'Final BOM count after Phase 2' as check_type, COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions 
FROM "Bom";

-- Show summary of what was migrated in Phase 2
SELECT 'Phase 2 Migration summary' as check_type, 
       '8 BOM records deleted, 299 BOM items migrated, 299 Production Orders migrated' as summary;

-- Review results above, then either COMMIT or ROLLBACK
-- If all verification checks show expected results (0 duplicates, 0 orphaned items/orders):
-- COMMIT;

-- If there are any issues:
-- ROLLBACK; 