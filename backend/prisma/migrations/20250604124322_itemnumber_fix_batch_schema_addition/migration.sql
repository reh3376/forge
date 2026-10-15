/*
  Warnings:

  - You are about to drop the column `recipeId` on the `Batch` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[itemNumber]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/

-- =====================================================
-- STEP 1: Resolve Item duplicates before creating unique constraint
-- =====================================================

-- Migrate all references to point to the "best" Item for each duplicate group
-- Strategy: Keep Items with positive erpIds over negative/null erpIds

-- Create a temporary table to identify the best Item for each duplicate group
CREATE TEMP TABLE item_resolution_mapping AS
WITH duplicate_groups AS (
    SELECT 
        "itemNumber",
        id,
        "erpId",
        "itemName",
        "createdAt",
        -- Ranking logic: prefer positive ERP IDs, then most recent, then by ID
        ROW_NUMBER() OVER (
            PARTITION BY "itemNumber" 
            ORDER BY 
                CASE 
                    WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                    WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                    ELSE 3
                END,
                (SELECT COUNT(*) FROM "BomItem" WHERE "itemId" = i.id) DESC,
                i."createdAt"
        ) as rn
    FROM "Item" i
    WHERE "itemNumber" IN (
        SELECT "itemNumber" 
        FROM "Item" 
        GROUP BY "itemNumber" 
        HAVING COUNT(*) > 1
    )
)
SELECT 
    dg.id as source_item_id,
    keeper.id as target_item_id,
    dg."itemNumber",
    dg.rn > 1 as should_delete
FROM duplicate_groups dg
JOIN duplicate_groups keeper ON dg."itemNumber" = keeper."itemNumber" AND keeper.rn = 1;

-- Show what we're about to do
DO $$
DECLARE
    migration_count INTEGER;
    deletion_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migration_count
    FROM item_resolution_mapping 
    WHERE should_delete = true AND source_item_id != target_item_id;
    
    SELECT COUNT(*) INTO deletion_count
    FROM item_resolution_mapping 
    WHERE should_delete = true;
    
    RAISE NOTICE 'Will migrate % Item references and delete % duplicate Item records', migration_count, deletion_count;
END $$;

-- Update all tables that reference Items
-- Update BomItem references
UPDATE "BomItem" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "BomItem"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update Bom references
UPDATE "Bom" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "Bom"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update ProductionOrder references (fgItemId)
UPDATE "ProductionOrder" 
SET "fgItemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "ProductionOrder"."fgItemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update AdditiveActual references
UPDATE "AdditiveActual" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "AdditiveActual"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update Inventory references
UPDATE "Inventory" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "Inventory"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update InventoryLog references
UPDATE "InventoryLog" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "InventoryLog"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update InventoryTransfer references
UPDATE "InventoryTransfer" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "InventoryTransfer"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update ItemReceipt references
UPDATE "ItemReceipt" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "ItemReceipt"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update Lot references (continerItemId)
UPDATE "Lot" 
SET "continerItemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "Lot"."continerItemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update RecipeBomItem references
UPDATE "RecipeBomItem" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "RecipeBomItem"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update enzyme_configurations references
UPDATE "enzyme_configurations" 
SET "itemId" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "enzyme_configurations"."itemId" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update many-to-many relationship tables
-- Update _ItemOnLots references
UPDATE "_ItemOnLots" 
SET "A" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "_ItemOnLots"."A" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update _ItemToPurchaseOrder references
UPDATE "_ItemToPurchaseOrder" 
SET "A" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "_ItemToPurchaseOrder"."A" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update _ItemToSalesOrder references
UPDATE "_ItemToSalesOrder" 
SET "A" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "_ItemToSalesOrder"."A" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update _ItemToTestParameter references
UPDATE "_ItemToTestParameter" 
SET "A" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "_ItemToTestParameter"."A" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Update _containerItem references
UPDATE "_containerItem" 
SET "A" = irm.target_item_id
FROM item_resolution_mapping irm
WHERE "_containerItem"."A" = irm.source_item_id 
AND irm.should_delete = true
AND irm.source_item_id != irm.target_item_id;

-- Delete duplicate Item records (keeping only the "best" one from each group)
DELETE FROM "Item" 
WHERE id IN (
    SELECT source_item_id 
    FROM item_resolution_mapping 
    WHERE should_delete = true
);

-- Clean up temporary table
DROP TABLE item_resolution_mapping;

-- Clean up any orphaned records
DELETE FROM "BomItem" 
WHERE NOT EXISTS (
    SELECT 1 FROM "Item" i WHERE i.id = "BomItem"."itemId"
);

-- =====================================================
-- STEP 2: Original migration content
-- =====================================================

-- CreateEnum
CREATE TYPE "EnumBatchParameterConfigurationAggregationType" AS ENUM ('Option1');

-- CreateEnum
CREATE TYPE "EnumBatchParameterConfigurationCollectionMethod" AS ENUM ('Option1');

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_recipeId_fkey";

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "recipeId";

-- CreateTable
CREATE TABLE "BatchTimeSeriesData" (
    "batchId" TEXT,
    "booleanValue" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "quality" TEXT,
    "source" TEXT,
    "stringValue" TEXT,
    "tagName" TEXT,
    "timestamp" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchTimeSeriesData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchMaterialConsumption" (
    "batchId" TEXT,
    "binNumber" INTEGER,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "lotId" TEXT,
    "quantity" DOUBLE PRECISION,
    "supplierLot" TEXT,
    "units" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,

    CONSTRAINT "BatchMaterialConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchParameterConfiguration" (
    "active" BOOLEAN,
    "aggregationType" "EnumBatchParameterConfigurationAggregationType",
    "batchType" TEXT,
    "category" TEXT,
    "collectionMethod" "EnumBatchParameterConfigurationCollectionMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decimalPlaces" INTEGER,
    "displayName" TEXT,
    "id" TEXT NOT NULL,
    "isRequired" BOOLEAN,
    "maxValue" DOUBLE PRECISION,
    "minValue" DOUBLE PRECISION,
    "parameterName" TEXT,
    "parameterPath" TEXT,
    "sortOrder" INTEGER,
    "targetValue" DOUBLE PRECISION,
    "tolerance" DOUBLE PRECISION,
    "units" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchParameterConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchParameterValue" (
    "batchId" TEXT,
    "booleanValue" BOOLEAN,
    "collectedAt" TIMESTAMP(3),
    "collectionSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataQuality" TEXT,
    "deviationPercent" DOUBLE PRECISION,
    "id" TEXT NOT NULL,
    "isWithinSpec" BOOLEAN,
    "numericValue" DOUBLE PRECISION,
    "parameterConfig" TEXT,
    "stringValue" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,

    CONSTRAINT "BatchParameterValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorShift" (
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN,
    "notes" TEXT,
    "operator" TEXT,
    "shiftType" TEXT,
    "startTime" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (this should now work since duplicates are resolved)
CREATE UNIQUE INDEX "Item_itemNumber_key" ON "Item"("itemNumber");

-- AddForeignKey
ALTER TABLE "BatchTimeSeriesData" ADD CONSTRAINT "BatchTimeSeriesData_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMaterialConsumption" ADD CONSTRAINT "BatchMaterialConsumption_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMaterialConsumption" ADD CONSTRAINT "BatchMaterialConsumption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMaterialConsumption" ADD CONSTRAINT "BatchMaterialConsumption_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchParameterValue" ADD CONSTRAINT "BatchParameterValue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorShift" ADD CONSTRAINT "OperatorShift_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
