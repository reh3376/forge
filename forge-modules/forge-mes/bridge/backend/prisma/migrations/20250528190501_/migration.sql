/*
  Warnings:

  - A unique constraint covering the columns `[bomRevision]` on the table `Bom` will be added. If there are existing duplicate values, this will fail.

*/

-- =============================================
-- BOM DUPLICATE RESOLUTION (Added for migration fix)
-- =============================================

-- Step 1: Identify and resolve BOM duplicates
-- This follows the established pattern of migrating data from less preferred records to preferred records

-- First, let's see what we're dealing with
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'Found % BOM duplicates to resolve', duplicate_count;
END $$;

-- Step 2: Create a temporary table to identify the "best" BOM record for each duplicate group
CREATE TEMP TABLE bom_resolution_mapping AS
WITH duplicate_groups AS (
    SELECT 
        "bomRevision",
        id,
        "erpId",
        "bomName",
        "createdAt",
        -- Ranking logic: prefer positive ERP IDs, then most recent, then by ID
        ROW_NUMBER() OVER (
            PARTITION BY "bomRevision" 
            ORDER BY 
                CASE 
                    WHEN "erpId" IS NOT NULL AND "erpId"::INTEGER > 0 THEN 1
                    WHEN "erpId" IS NULL THEN 2
                    ELSE 3
                END,
                "createdAt" DESC,
                id
        ) as rn
    FROM "Bom"
    WHERE "bomRevision" IN (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    )
)
SELECT 
    dg.id as source_bom_id,
    keeper.id as target_bom_id,
    dg."bomRevision",
    dg.rn > 1 as should_delete
FROM duplicate_groups dg
JOIN duplicate_groups keeper ON dg."bomRevision" = keeper."bomRevision" AND keeper.rn = 1;

-- Step 3: Show what we're about to do
DO $$
DECLARE
    migration_count INTEGER;
    deletion_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migration_count
    FROM bom_resolution_mapping 
    WHERE should_delete = true AND source_bom_id != target_bom_id;
    
    SELECT COUNT(*) INTO deletion_count
    FROM bom_resolution_mapping 
    WHERE should_delete = true;
    
    RAISE NOTICE 'Will migrate % BOM references and delete % duplicate BOM records', migration_count, deletion_count;
END $$;

-- Step 4: Migrate BOM items from duplicate records to the preferred record
UPDATE "BomItem" 
SET "bomId" = brm.target_bom_id
FROM bom_resolution_mapping brm
WHERE "BomItem"."bomId" = brm.source_bom_id 
AND brm.should_delete = true
AND brm.source_bom_id != brm.target_bom_id;

-- Step 5: Migrate ProductionOrders from duplicate records to the preferred record
UPDATE "ProductionOrder" 
SET "bomId" = brm.target_bom_id
FROM bom_resolution_mapping brm
WHERE "ProductionOrder"."bomId" = brm.source_bom_id 
AND brm.should_delete = true
AND brm.source_bom_id != brm.target_bom_id;

-- Step 6: Delete the duplicate BOM records (keeping the preferred ones)
DELETE FROM "Bom" 
WHERE id IN (
    SELECT source_bom_id 
    FROM bom_resolution_mapping 
    WHERE should_delete = true
);

-- Step 7: Clean up temporary table
DROP TABLE bom_resolution_mapping;

-- Step 8: Final verification
DO $$
DECLARE
    remaining_duplicates INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_duplicates
    FROM (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'Remaining BOM duplicates after resolution: %', remaining_duplicates;
    
    IF remaining_duplicates > 0 THEN
        RAISE EXCEPTION 'BOM duplicates still exist after resolution attempt';
    END IF;
END $$;

-- =============================================
-- END BOM DUPLICATE RESOLUTION
-- =============================================

-- CreateEnum
CREATE TYPE "EnumNotificationNotificationType" AS ENUM ('Push', 'Sms', 'Email');

-- CreateEnum
CREATE TYPE "EnumNotificationStatus" AS ENUM ('Queued', 'Sent', 'Acknowledged');

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "lowerControlLimit" INTEGER,
ADD COLUMN     "upperControlLimit" INTEGER;

-- CreateTable
CREATE TABLE "Comment" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "lotId" TEXT,
    "recipeId" TEXT,
    "replyToId" TEXT,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "user" TEXT,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPayload" JSONB,
    "id" TEXT NOT NULL,
    "message" TEXT,
    "notificationType" "EnumNotificationNotificationType"[] DEFAULT ARRAY['Push']::"EnumNotificationNotificationType"[],
    "relatedRecordId" TEXT,
    "relatedRecordType" TEXT,
    "requestor" TEXT,
    "sentAt" TIMESTAMP(3),
    "status" "EnumNotificationStatus",
    "targetRoles" JSONB NOT NULL,
    "targetUsers" TEXT,
    "title" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "id" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "owner" TEXT NOT NULL,
    "shared" BOOLEAN DEFAULT false,
    "title" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Widget" (
    "configField" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dashboardId" TEXT,
    "id" TEXT NOT NULL,
    "isVisible" BOOLEAN,
    "name" TEXT,
    "position" TEXT,
    "typeField" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bom_bomRevision_key" ON "Bom"("bomRevision");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
