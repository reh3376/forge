-- =====================================================
-- STEP 1: CREATE BACKUP TABLES
-- =====================================================
-- This script creates backup tables for all data we'll be modifying
-- Run this FIRST before any other migration scripts

-- Drop existing backup tables if they exist
DROP TABLE IF EXISTS "Bom_backup_migration_20250128";
DROP TABLE IF EXISTS "BomItem_backup_migration_20250128";

-- Create backup tables
CREATE TABLE "Bom_backup_migration_20250128" AS SELECT * FROM "Bom";
CREATE TABLE "BomItem_backup_migration_20250128" AS SELECT * FROM "BomItem";

-- Verify backups were created successfully
SELECT 'Bom backup created' as status, COUNT(*) as record_count FROM "Bom_backup_migration_20250128";
SELECT 'BomItem backup created' as status, COUNT(*) as record_count FROM "BomItem_backup_migration_20250128";

-- Show current duplicate state
SELECT 'Current duplicates' as status, COUNT(*) as duplicate_revisions
FROM (
    SELECT "bomRevision"
    FROM "Bom"
    GROUP BY "bomRevision"
    HAVING COUNT(*) > 1
) duplicates;

SELECT NOW() as backup_completed_at; 