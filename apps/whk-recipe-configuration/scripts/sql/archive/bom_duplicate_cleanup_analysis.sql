-- =====================================================
-- BOM Duplicate Cleanup Analysis Script
-- =====================================================
-- This script provides recommendations for cleaning up
-- duplicate BOM revisions based on various criteria
-- =====================================================

-- 1. Duplicates with different creation dates (keep newest)
-- =====================================================
WITH duplicate_analysis AS (
    SELECT 
        b."bomRevision",
        b.id,
        b."bomName",
        b."createdAt",
        b."inactive",
        i."itemName",
        i."itemNumber",
        ROW_NUMBER() OVER (PARTITION BY b."bomRevision" ORDER BY b."createdAt" DESC) as recency_rank,
        COUNT(*) OVER (PARTITION BY b."bomRevision") as duplicate_count
    FROM "Bom" b
    LEFT JOIN "Item" i ON b."itemId" = i.id
    WHERE b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
)
SELECT 
    'CLEANUP RECOMMENDATION - Keep Newest' as recommendation_type,
    "bomRevision",
    duplicate_count,
    CASE 
        WHEN recency_rank = 1 THEN 'KEEP - Most Recent'
        ELSE 'DELETE - Older Version'
    END as action,
    id as bom_id,
    "bomName",
    "createdAt",
    "inactive",
    "itemName",
    "itemNumber"
FROM duplicate_analysis
ORDER BY "bomRevision", recency_rank;

-- 2. Duplicates with inactive status (prefer active ones)
-- =====================================================
WITH inactive_analysis AS (
    SELECT 
        b."bomRevision",
        b.id,
        b."bomName",
        b."createdAt",
        b."inactive",
        i."itemName",
        COUNT(*) OVER (PARTITION BY b."bomRevision") as duplicate_count,
        COUNT(CASE WHEN b."inactive" = false THEN 1 END) OVER (PARTITION BY b."bomRevision") as active_count
    FROM "Bom" b
    LEFT JOIN "Item" i ON b."itemId" = i.id
    WHERE b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
)
SELECT 
    'CLEANUP RECOMMENDATION - Prefer Active' as recommendation_type,
    "bomRevision",
    duplicate_count,
    active_count,
    CASE 
        WHEN "inactive" = true AND active_count > 0 THEN 'DELETE - Inactive (Active exists)'
        WHEN "inactive" = false THEN 'KEEP - Active'
        ELSE 'REVIEW - All Inactive'
    END as action,
    id as bom_id,
    "bomName",
    "createdAt",
    "inactive",
    "itemName"
FROM inactive_analysis
ORDER BY "bomRevision", "inactive", "createdAt" DESC;

-- 3. Summary of cleanup actions needed
-- =====================================================
WITH cleanup_summary AS (
    SELECT 
        b."bomRevision",
        COUNT(*) as total_duplicates,
        COUNT(CASE WHEN b."inactive" = true THEN 1 END) as inactive_count,
        COUNT(CASE WHEN b."inactive" = false THEN 1 END) as active_count,
        MIN(b."createdAt") as oldest_date,
        MAX(b."createdAt") as newest_date
    FROM "Bom" b
    WHERE b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
    GROUP BY b."bomRevision"
)
SELECT 
    'CLEANUP SUMMARY' as summary_type,
    "bomRevision",
    total_duplicates,
    active_count,
    inactive_count,
    CASE 
        WHEN inactive_count > 0 AND active_count > 0 THEN 'Delete ' || inactive_count || ' inactive versions'
        WHEN active_count = total_duplicates THEN 'Keep newest, delete ' || (total_duplicates - 1) || ' older versions'
        WHEN inactive_count = total_duplicates THEN 'All inactive - manual review needed'
        ELSE 'Manual review required'
    END as recommended_action,
    oldest_date,
    newest_date,
    (newest_date - oldest_date) as date_span
FROM cleanup_summary
ORDER BY total_duplicates DESC, "bomRevision";

-- 4. Generate DELETE statements for obvious candidates
-- =====================================================
WITH delete_candidates AS (
    SELECT 
        b.id,
        b."bomRevision",
        b."bomName",
        b."createdAt",
        b."inactive",
        ROW_NUMBER() OVER (PARTITION BY b."bomRevision" ORDER BY 
            CASE WHEN b."inactive" = true THEN 1 ELSE 0 END,  -- Prefer deleting inactive
            b."createdAt" ASC  -- Then prefer deleting older ones
        ) as delete_priority,
        COUNT(*) OVER (PARTITION BY b."bomRevision") as duplicate_count,
        COUNT(CASE WHEN b."inactive" = false THEN 1 END) OVER (PARTITION BY b."bomRevision") as active_count
    FROM "Bom" b
    WHERE b."bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
)
SELECT 
    'GENERATED DELETE STATEMENTS' as statement_type,
    'DELETE FROM "Bom" WHERE id = ''' || id || '''; -- ' || 
    "bomRevision" || ' (' || "bomName" || ') - ' ||
    CASE WHEN "inactive" THEN 'Inactive' ELSE 'Active' END || 
    ' created ' || "createdAt"::date as delete_statement
FROM delete_candidates
WHERE delete_priority < duplicate_count  -- Don't delete the last one
AND (
    ("inactive" = true AND active_count > 0) OR  -- Delete inactive if active exists
    ("inactive" = false AND delete_priority = 1 AND active_count > 1)  -- Delete oldest active if multiple active
)
ORDER BY "bomRevision", delete_priority;

-- 5. Items that might need attention due to BOM duplicates
-- =====================================================
SELECT 
    'ITEMS WITH DUPLICATE BOMS' as analysis_type,
    i."itemNumber",
    i."itemName",
    i."itemType",
    COUNT(DISTINCT b."bomRevision") as unique_bom_revisions,
    COUNT(b.id) as total_boms,
    STRING_AGG(DISTINCT b."bomRevision", ', ') as bom_revisions
FROM "Item" i
JOIN "Bom" b ON i.id = b."itemId"
WHERE b."bomRevision" IN (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
)
GROUP BY i.id, i."itemNumber", i."itemName", i."itemType"
HAVING COUNT(b.id) > COUNT(DISTINCT b."bomRevision")
ORDER BY total_boms DESC, i."itemNumber"; 