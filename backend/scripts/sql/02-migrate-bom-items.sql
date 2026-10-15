-- =====================================================
-- STEP 2: MIGRATE BOM ITEMS AND PRODUCTION ORDERS
-- =====================================================
-- This script migrates BOM items AND ProductionOrder references 
-- from duplicate BOM records to the correct target BOMs
-- Run this AFTER step 1 (backup tables)

BEGIN;

SELECT 'STARTING BOM MIGRATION (ITEMS + PRODUCTION ORDERS)' as step, NOW() as started_at;

-- =====================================================
-- Migrate for RUN1-BOM-HNW-51-39-00-10-R01
-- =====================================================
-- From: clyyl1jar0007qqbin6mnjl3i (bomName: '-9', erpId: 'TEMP_7') - 14 items, 1 production order
-- To:   cm18666iz0f42ba9imylhkxh6 (bomName: '29', erpId: '31') - 0 items, 0 production orders

-- First migrate ProductionOrders
UPDATE "ProductionOrder" 
SET "bomId" = 'cm18666iz0f42ba9imylhkxh6' 
WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3i';

SELECT 'Migrated RUN1-BOM-HNW-51-39-00-10-R01 ProductionOrders' as status, 
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm18666iz0f42ba9imylhkxh6') as orders_in_target,
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3i') as orders_in_source;

-- Then migrate BOM items
UPDATE "BomItem" 
SET "bomId" = 'cm18666iz0f42ba9imylhkxh6' 
WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3i';

SELECT 'Migrated RUN1-BOM-HNW-51-39-00-10-R01 BomItems' as status, 
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm18666iz0f42ba9imylhkxh6') as items_in_target,
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3i') as items_in_source;

-- =====================================================
-- Migrate for RUN1-BOM-WCL-75-15-00-10-R01
-- =====================================================
-- From: clyyl1jar0007qqbin6mnjl3h (bomName: '-8', erpId: 'TEMP_6') - 13 items, 2 production orders
-- To:   cm16ol6970cie13ivacb3siay (bomName: '25', erpId: '28') - 0 items, 0 production orders

-- First migrate ProductionOrders
UPDATE "ProductionOrder" 
SET "bomId" = 'cm16ol6970cie13ivacb3siay' 
WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3h';

SELECT 'Migrated RUN1-BOM-WCL-75-15-00-10-R01 ProductionOrders' as status, 
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm16ol6970cie13ivacb3siay') as orders_in_target,
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3h') as orders_in_source;

-- Then migrate BOM items
UPDATE "BomItem" 
SET "bomId" = 'cm16ol6970cie13ivacb3siay' 
WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3h';

SELECT 'Migrated RUN1-BOM-WCL-75-15-00-10-R01 BomItems' as status, 
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm16ol6970cie13ivacb3siay') as items_in_target,
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'clyyl1jar0007qqbin6mnjl3h') as items_in_source;

-- =====================================================
-- Migrate for RUN3-BOM-ABT-74-00-18-08-R01
-- =====================================================
-- Both BOMs have no ERP ID, so merge into the one with more items
-- From: cm1pfefon0000oipyt8yslkbh (12 items, 0 production orders)
-- To:   cm6fabzqw01zxxfqkegjinffa (13 items, 0 production orders)

-- First migrate ProductionOrders (should be none)
UPDATE "ProductionOrder" 
SET "bomId" = 'cm6fabzqw01zxxfqkegjinffa' 
WHERE "bomId" = 'cm1pfefon0000oipyt8yslkbh';

SELECT 'Migrated RUN3-BOM-ABT-74-00-18-08-R01 ProductionOrders' as status, 
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm6fabzqw01zxxfqkegjinffa') as orders_in_target,
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm1pfefon0000oipyt8yslkbh') as orders_in_source;

-- Then migrate BOM items
UPDATE "BomItem" 
SET "bomId" = 'cm6fabzqw01zxxfqkegjinffa' 
WHERE "bomId" = 'cm1pfefon0000oipyt8yslkbh';

SELECT 'Migrated RUN3-BOM-ABT-74-00-18-08-R01 BomItems' as status, 
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm6fabzqw01zxxfqkegjinffa') as items_in_target,
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm1pfefon0000oipyt8yslkbh') as items_in_source;

-- =====================================================
-- Migrate for RUN3-BOM-WSC-74-18-00-08-R01
-- =====================================================
-- Both BOMs have no ERP ID, so merge into the first one
-- From: cm67x1vyo05dy4o91pt30kpdv (13 items, 2 production orders)
-- To:   cm5ftfu5w1h1b12bgs8w1w4wa (13 items, 0 production orders)

-- First migrate ProductionOrders
UPDATE "ProductionOrder" 
SET "bomId" = 'cm5ftfu5w1h1b12bgs8w1w4wa' 
WHERE "bomId" = 'cm67x1vyo05dy4o91pt30kpdv';

SELECT 'Migrated RUN3-BOM-WSC-74-18-00-08-R01 ProductionOrders' as status, 
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm5ftfu5w1h1b12bgs8w1w4wa') as orders_in_target,
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm67x1vyo05dy4o91pt30kpdv') as orders_in_source;

-- Then migrate BOM items
UPDATE "BomItem" 
SET "bomId" = 'cm5ftfu5w1h1b12bgs8w1w4wa' 
WHERE "bomId" = 'cm67x1vyo05dy4o91pt30kpdv';

SELECT 'Migrated RUN3-BOM-WSC-74-18-00-08-R01 BomItems' as status, 
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm5ftfu5w1h1b12bgs8w1w4wa') as items_in_target,
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm67x1vyo05dy4o91pt30kpdv') as items_in_source;

-- =====================================================
-- Migrate for x-BOM-PVS-70-22-00-08-R01
-- =====================================================
-- From: cm8d7d8x52eig59r1sjijqawy (bomName: 'BOM-PVS-70-22-00-08', erpId: NULL) - 12 items, 1 production order
-- To:   cm1z6khcq0krq14eookqhmf7s (bomName: '40', erpId: '43') - 0 items, 0 production orders

-- First migrate ProductionOrders
UPDATE "ProductionOrder" 
SET "bomId" = 'cm1z6khcq0krq14eookqhmf7s' 
WHERE "bomId" = 'cm8d7d8x52eig59r1sjijqawy';

SELECT 'Migrated x-BOM-PVS-70-22-00-08-R01 ProductionOrders' as status, 
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm1z6khcq0krq14eookqhmf7s') as orders_in_target,
       (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = 'cm8d7d8x52eig59r1sjijqawy') as orders_in_source;

-- Then migrate BOM items
UPDATE "BomItem" 
SET "bomId" = 'cm1z6khcq0krq14eookqhmf7s' 
WHERE "bomId" = 'cm8d7d8x52eig59r1sjijqawy';

SELECT 'Migrated x-BOM-PVS-70-22-00-08-R01 BomItems' as status, 
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm1z6khcq0krq14eookqhmf7s') as items_in_target,
       (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = 'cm8d7d8x52eig59r1sjijqawy') as items_in_source;

-- =====================================================
-- Verify migration was successful
-- =====================================================
SELECT 'VERIFYING MIGRATION SUCCESS' as step;

-- Check that no BOM items still reference the source BOMs we plan to delete
SELECT 'BomItems still referencing source BOMs' as check_type, COUNT(*) as count
FROM "BomItem" bi
WHERE bi."bomId" IN (
    'clyyl1jar0007qqbin6mnjl3i',  -- RUN1-BOM-HNW-51-39-00-10-R01 source
    'clyyl1jar0007qqbin6mnjl3h',  -- RUN1-BOM-WCL-75-15-00-10-R01 source
    'cm1pfefon0000oipyt8yslkbh',  -- RUN3-BOM-ABT-74-00-18-08-R01 source
    'cm67x1vyo05dy4o91pt30kpdv',  -- RUN3-BOM-WSC-74-18-00-08-R01 source
    'cm8d7d8x52eig59r1sjijqawy'   -- x-BOM-PVS-70-22-00-08-R01 source
);

-- Check that no ProductionOrders still reference the source BOMs we plan to delete
SELECT 'ProductionOrders still referencing source BOMs' as check_type, COUNT(*) as count
FROM "ProductionOrder" po
WHERE po."bomId" IN (
    'clyyl1jar0007qqbin6mnjl3i',  -- RUN1-BOM-HNW-51-39-00-10-R01 source
    'clyyl1jar0007qqbin6mnjl3h',  -- RUN1-BOM-WCL-75-15-00-10-R01 source
    'cm1pfefon0000oipyt8yslkbh',  -- RUN3-BOM-ABT-74-00-18-08-R01 source
    'cm67x1vyo05dy4o91pt30kpdv',  -- RUN3-BOM-WSC-74-18-00-08-R01 source
    'cm8d7d8x52eig59r1sjijqawy'   -- x-BOM-PVS-70-22-00-08-R01 source
);

-- If both above queries return 0, it's safe to proceed with deletions
-- If either returns > 0, DO NOT PROCEED - investigate the issue

SELECT 'BOM MIGRATION COMPLETED' as step, NOW() as completed_at;

-- Review results above, then either COMMIT or ROLLBACK
-- If verification shows 0 items and 0 production orders still referencing source BOMs:
-- COMMIT;

-- If there are any issues:
-- ROLLBACK;

-- End of script 