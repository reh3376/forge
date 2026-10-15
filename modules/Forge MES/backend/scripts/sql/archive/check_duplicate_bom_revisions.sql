-- =====================================================
-- Duplicate BOM Revisions Check Script
-- =====================================================
-- This script checks for duplicate BOM revisions across
-- the Bom and RecipeBom tables in the PostgreSQL database
-- =====================================================

-- 1. Check for duplicate bomRevision values in the Bom table
-- =====================================================
SELECT 
    'Bom Table - Duplicate bomRevision' as check_type,
    b."bomRevision",
    COUNT(*) as duplicate_count,
    STRING_AGG(b.id, ', ') as bom_ids,
    STRING_AGG(DISTINCT b."bomName", ', ') as bom_names,
    STRING_AGG(DISTINCT i."itemName", ', ') as item_names,
    STRING_AGG(DISTINCT i."itemNumber", ', ') as item_numbers
FROM "Bom" b
LEFT JOIN "Item" i ON b."itemId" = i.id
GROUP BY b."bomRevision"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, b."bomRevision";

-- 2. Check for duplicate revision values in the RecipeBom table
-- =====================================================
SELECT 
    'RecipeBom Table - Duplicate revision' as check_type,
    rb."revision",
    COUNT(*) as duplicate_count,
    STRING_AGG(rb.id, ', ') as recipe_bom_ids,
    STRING_AGG(CASE WHEN rb."master" THEN 'Master' ELSE 'Non-Master' END, ', ') as master_status,
    STRING_AGG(CASE WHEN rb."running" THEN 'Running' ELSE 'Non-Running' END, ', ') as running_status
FROM "RecipeBom" rb
WHERE rb."revision" IS NOT NULL
GROUP BY rb."revision"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, rb."revision";

-- 3. Check for bomRevision/revision conflicts between Bom and RecipeBom tables
-- =====================================================
SELECT 
    'Cross-Table Revision Conflicts' as check_type,
    COALESCE(b."bomRevision", rb."revision") as revision_value,
    COUNT(DISTINCT b.id) as bom_count,
    COUNT(DISTINCT rb.id) as recipe_bom_count,
    STRING_AGG(DISTINCT b.id, ', ') as bom_ids,
    STRING_AGG(DISTINCT rb.id, ', ') as recipe_bom_ids,
    STRING_AGG(DISTINCT b."bomName", ', ') as bom_names,
    STRING_AGG(DISTINCT i."itemName", ', ') as item_names
FROM "Bom" b
FULL OUTER JOIN "RecipeBom" rb ON b."bomRevision" = rb."revision"
LEFT JOIN "Item" i ON b."itemId" = i.id
WHERE b."bomRevision" IS NOT NULL OR rb."revision" IS NOT NULL
GROUP BY COALESCE(b."bomRevision", rb."revision")
HAVING COUNT(DISTINCT b.id) > 0 AND COUNT(DISTINCT rb.id) > 0
ORDER BY revision_value;

-- 4. Detailed analysis of Bom table duplicates with item information
-- =====================================================
WITH bom_duplicates AS (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
)
SELECT 
    'Detailed Bom Duplicates Analysis' as check_type,
    b."bomRevision",
    b.id as bom_id,
    b."bomName",
    b."bomType",
    b."inactive",
    b."effectiveStartDate",
    b."effectiveEndDate",
    b."createdAt",
    b."createdBy",
    i."itemName",
    i."itemNumber",
    i."itemType",
    i."erpId" as item_erp_id
FROM "Bom" b
JOIN bom_duplicates bd ON b."bomRevision" = bd."bomRevision"
LEFT JOIN "Item" i ON b."itemId" = i.id
ORDER BY b."bomRevision", b."createdAt";

-- 5. Detailed analysis of RecipeBom table duplicates
-- =====================================================
WITH recipe_bom_duplicates AS (
    SELECT "revision"
    FROM "RecipeBom"
    WHERE "revision" IS NOT NULL
    GROUP BY "revision"
    HAVING COUNT(*) > 1
)
SELECT 
    'Detailed RecipeBom Duplicates Analysis' as check_type,
    rb."revision",
    rb.id as recipe_bom_id,
    rb."master",
    rb."running",
    rb."masterReceipeBomId",
    rb."runningRecipeBomId",
    rb."createdAt",
    rb."updatedAt"
FROM "RecipeBom" rb
JOIN recipe_bom_duplicates rbd ON rb."revision" = rbd."revision"
ORDER BY rb."revision", rb."createdAt";

-- 6. Summary statistics
-- =====================================================
SELECT 
    'Summary Statistics' as check_type,
    'Total BOMs' as metric,
    COUNT(*) as count
FROM "Bom"
UNION ALL
SELECT 
    'Summary Statistics' as check_type,
    'Total RecipeBOMs' as metric,
    COUNT(*) as count
FROM "RecipeBom"
UNION ALL
SELECT 
    'Summary Statistics' as check_type,
    'Unique BOM Revisions in Bom table' as metric,
    COUNT(DISTINCT "bomRevision") as count
FROM "Bom"
UNION ALL
SELECT 
    'Summary Statistics' as check_type,
    'Unique Revisions in RecipeBom table' as metric,
    COUNT(DISTINCT "revision") as count
FROM "RecipeBom"
WHERE "revision" IS NOT NULL
UNION ALL
SELECT 
    'Summary Statistics' as check_type,
    'Duplicate BOM Revisions in Bom table' as metric,
    COUNT(*) as count
FROM (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 
    'Summary Statistics' as check_type,
    'Duplicate Revisions in RecipeBom table' as metric,
    COUNT(*) as count
FROM (
    SELECT "revision"
    FROM "RecipeBom"
    WHERE "revision" IS NOT NULL
    GROUP BY "revision"
    HAVING COUNT(*) > 1
) duplicates;

-- 7. Check for potential data integrity issues
-- =====================================================
SELECT 
    'Data Integrity Issues' as check_type,
    'BOMs with NULL bomRevision' as issue_type,
    COUNT(*) as count
FROM "Bom"
WHERE "bomRevision" IS NULL
UNION ALL
SELECT 
    'Data Integrity Issues' as check_type,
    'BOMs with empty bomRevision' as issue_type,
    COUNT(*) as count
FROM "Bom"
WHERE "bomRevision" = ''
UNION ALL
SELECT 
    'Data Integrity Issues' as check_type,
    'RecipeBOMs with NULL revision' as issue_type,
    COUNT(*) as count
FROM "RecipeBom"
WHERE "revision" IS NULL
UNION ALL
SELECT 
    'Data Integrity Issues' as check_type,
    'RecipeBOMs with empty revision' as issue_type,
    COUNT(*) as count
FROM "RecipeBom"
WHERE "revision" = ''; 