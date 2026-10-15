-- =====================================================
-- STEP 3: DELETE DUPLICATE BOM RECORDS
-- =====================================================
-- This script deletes the duplicate BOM records after items have been migrated
-- Run this AFTER step 2 (migrate BOM items)
-- ONLY run this if step 2 verification showed 0 items still referencing source BOMs

BEGIN;

SELECT 'STARTING BOM RECORD DELETION' as step, NOW() as started_at;

-- =====================================================
-- Final verification before deletion
-- =====================================================
SELECT 'PRE-DELETION VERIFICATION' as step;

-- Verify no BOM items reference the BOMs we're about to delete
SELECT 'Items referencing BOMs to delete' as check_type, COUNT(*) as count
FROM "BomItem" bi
WHERE bi."bomId" IN (
    'clyyl1jar0007qqbin6mnjl3i',  -- RUN1-BOM-HNW-51-39-00-10-R01 source
    'clyyl1jar0007qqbin6mnjl3h',  -- RUN1-BOM-WCL-75-15-00-10-R01 source
    'cm1pfefon0000oipyt8yslkbh',  -- RUN3-BOM-ABT-74-00-18-08-R01 source
    'cm67x1vyo05dy4o91pt30kpdv',  -- RUN3-BOM-WSC-74-18-00-08-R01 source
    'cm8d7d8x52eig59r1sjijqawy'   -- x-BOM-PVS-70-22-00-08-R01 source
);

-- If the above returns > 0, STOP and investigate!

-- =====================================================
-- Delete duplicate BOM records
-- =====================================================

-- Delete RUN1-BOM-HNW-51-39-00-10-R01 source (bomName: '-9', erpId: 'TEMP_7')
DELETE FROM "Bom" WHERE id = 'clyyl1jar0007qqbin6mnjl3i';
SELECT 'Deleted RUN1-BOM-HNW-51-39-00-10-R01 source' as status, 
       (SELECT COUNT(*) FROM "Bom" WHERE id = 'clyyl1jar0007qqbin6mnjl3i') as remaining_count;

-- Delete RUN1-BOM-WCL-75-15-00-10-R01 source (bomName: '-8', erpId: 'TEMP_6')
DELETE FROM "Bom" WHERE id = 'clyyl1jar0007qqbin6mnjl3h';
SELECT 'Deleted RUN1-BOM-WCL-75-15-00-10-R01 source' as status, 
       (SELECT COUNT(*) FROM "Bom" WHERE id = 'clyyl1jar0007qqbin6mnjl3h') as remaining_count;

-- Delete RUN3-BOM-ABT-74-00-18-08-R01 source (12 items, kept the one with 13 items)
DELETE FROM "Bom" WHERE id = 'cm1pfefon0000oipyt8yslkbh';
SELECT 'Deleted RUN3-BOM-ABT-74-00-18-08-R01 source' as status, 
       (SELECT COUNT(*) FROM "Bom" WHERE id = 'cm1pfefon0000oipyt8yslkbh') as remaining_count;

-- Delete RUN3-BOM-WSC-74-18-00-08-R01 source (merged into first one)
DELETE FROM "Bom" WHERE id = 'cm67x1vyo05dy4o91pt30kpdv';
SELECT 'Deleted RUN3-BOM-WSC-74-18-00-08-R01 source' as status, 
       (SELECT COUNT(*) FROM "Bom" WHERE id = 'cm67x1vyo05dy4o91pt30kpdv') as remaining_count;

-- Delete x-BOM-PVS-70-22-00-08-R01 source (bomName: 'BOM-PVS-70-22-00-08', erpId: NULL)
DELETE FROM "Bom" WHERE id = 'cm8d7d8x52eig59r1sjijqawy';
SELECT 'Deleted x-BOM-PVS-70-22-00-08-R01 source' as status, 
       (SELECT COUNT(*) FROM "Bom" WHERE id = 'cm8d7d8x52eig59r1sjijqawy') as remaining_count;

-- =====================================================
-- Final verification
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

-- Show final counts
SELECT 'Final BOM count' as check_type, COUNT(*) as total_boms, COUNT(DISTINCT "bomRevision") as unique_revisions
FROM "Bom";

SELECT 'BOM RECORD DELETION COMPLETED' as step, NOW() as completed_at;

-- Review results above, then either COMMIT or ROLLBACK
-- If all verification checks show expected results (0 duplicates, 0 orphaned items):
-- COMMIT;

-- If there are any issues:
-- ROLLBACK;

-- End of script 