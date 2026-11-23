-- =====================================================
-- Quick Duplicate BOM Revisions Check
-- =====================================================
-- Simplified script for quick duplicate BOM analysis
-- =====================================================

-- Quick Summary: Show duplicate counts
SELECT 
    'SUMMARY' as section,
    'Total BOMs: ' || COUNT(*) as info
FROM "Bom"
UNION ALL
SELECT 
    'SUMMARY' as section,
    'Unique BOM Revisions: ' || COUNT(DISTINCT "bomRevision") as info
FROM "Bom"
UNION ALL
SELECT 
    'SUMMARY' as section,
    'Duplicate BOM Revisions: ' || COUNT(*) as info
FROM (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

-- List all duplicate BOM revisions with basic info
SELECT 
    b."bomRevision",
    COUNT(*) as duplicate_count,
    STRING_AGG(b."bomName", ', ') as bom_names,
    STRING_AGG(b.id, ', ') as bom_ids
FROM "Bom" b
GROUP BY b."bomRevision"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, b."bomRevision";

-- Show the most problematic duplicates (highest count first)
SELECT 
    'TOP DUPLICATES' as section,
    b."bomRevision",
    COUNT(*) as duplicate_count,
    MIN(b."createdAt") as first_created,
    MAX(b."createdAt") as last_created
FROM "Bom" b
GROUP BY b."bomRevision"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, b."bomRevision"
LIMIT 10; 