    /*
    Warnings:

    - The values [Text] on the enum `EnumRecipeParameterRecipeSetpointType` will be removed. If these variants are still used in the database, this will fail.
    - The `operationType` column on the `Batch` table would be dropped and recreated. This will lead to data loss if there is data in the column.
    - You are about to drop the column `lotId` on the `FermentationChemistry` table. All the data in the column will be lost.
    - You are about to drop the column `assetId` on the `ItemReceipt` table. All the data in the column will be lost.
    - You are about to drop the column `salesOrderId` on the `ProductionOrder` table. All the data in the column will be lost.
    - You are about to drop the `ProductionOrderUnitProcedure` table. If the table is not empty, all the data it contains will be lost.
    - You are about to drop the `_RecipeToRecipeParameter` table. If the table is not empty, all the data it contains will be lost.

    */
    -- CreateEnum
    CREATE TYPE "EnumScheduleOrderQueueNextOperation" AS ENUM ('Mashing01', 'Fermentation01', 'Distillation01', 'Processing01');

    -- CreateEnum
    CREATE TYPE "EnumLotWhiskeyType" AS ENUM ('AmericanSingleMalt', 'CornBourbon', 'CornWhiskey', 'RyeBourbon', 'RyeWhiskey', 'WheatedBourbon', 'WheatWhiskey');

    -- CreateEnum
    CREATE TYPE "EnumBatchOperationType" AS ENUM ('Mashing01', 'Fermentation01', 'Distillation01', 'Processing01', 'Barreling01');

    -- CreateEnum
    CREATE TYPE "EnumRecipeBomItemOperation" AS ENUM ('Mashing01', 'Fermentation01', 'Distillation01', 'Processing01');

    -- CreateEnum
    CREATE TYPE "EnumMashingProtocolStepHoldType" AS ENUM ('Heat', 'Cool', 'Hold');

    -- CreateEnum
    CREATE TYPE "EnumMashingProtocolStepStepType" AS ENUM ('Hold', 'LiquidAdd', 'Corn', 'Wheat', 'Rye', 'PreMalt', 'Malt', 'Prompt', 'AdditiveAdd');

    -- AlterEnum
    BEGIN;
    CREATE TYPE "EnumRecipeParameterRecipeSetpointType_new" AS ENUM ('Boolean', 'Numeric', 'String');
    ALTER TABLE "RecipeParameter" ALTER COLUMN "recipeSetpointType" TYPE "EnumRecipeParameterRecipeSetpointType_new" USING ("recipeSetpointType"::text::"EnumRecipeParameterRecipeSetpointType_new");
    ALTER TYPE "EnumRecipeParameterRecipeSetpointType" RENAME TO "EnumRecipeParameterRecipeSetpointType_old";
    ALTER TYPE "EnumRecipeParameterRecipeSetpointType_new" RENAME TO "EnumRecipeParameterRecipeSetpointType";
    DROP TYPE "EnumRecipeParameterRecipeSetpointType_old";
    COMMIT;

    -- DropForeignKey
    ALTER TABLE "FermentationChemistry" DROP CONSTRAINT "FermentationChemistry_lotId_fkey";

    -- DropForeignKey
    ALTER TABLE "ItemReceipt" DROP CONSTRAINT "ItemReceipt_assetId_fkey";

    -- DropForeignKey
    ALTER TABLE "ProductionOrder" DROP CONSTRAINT "ProductionOrder_salesOrderId_fkey";

    -- DropForeignKey
    ALTER TABLE "ProductionOrderUnitProcedure" DROP CONSTRAINT "ProductionOrderUnitProcedure_itemId_fkey";

    -- DropForeignKey
    ALTER TABLE "ProductionOrderUnitProcedure" DROP CONSTRAINT "ProductionOrderUnitProcedure_productionOrderId_fkey";

    -- DropForeignKey
    ALTER TABLE "ProductionOrderUnitProcedure" DROP CONSTRAINT "ProductionOrderUnitProcedure_recipeId_fkey";

    -- DropForeignKey
    ALTER TABLE "ProductionOrderUnitProcedure" DROP CONSTRAINT "ProductionOrderUnitProcedure_unitProcedureId_fkey";

    -- DropForeignKey
    ALTER TABLE "ScheduleOrderQueue" DROP CONSTRAINT "ScheduleOrderQueue_nextUnitProcedureId_fkey";

     -- DropForeignKey
    ALTER TABLE "_RecipeToRecipeParameter" DROP CONSTRAINT "_RecipeToRecipeParameter_A_fkey";

    -- DropForeignKey
    ALTER TABLE "_RecipeToRecipeParameter" DROP CONSTRAINT "_RecipeToRecipeParameter_B_fkey";

    -- FINDME -- DropIndex
    DROP INDEX "Asset_parentId_key";

    -- DropIndex
    DROP INDEX "FermentationChemistry_lotId_key";

    -- DropIndex
    DROP INDEX "ProductionOrder_salesOrderId_key";

    -- AlterTable
    ALTER TABLE "Batch" ADD COLUMN     "customerId" TEXT,
    ADD COLUMN     "mashingProtocolId" TEXT,
    ADD COLUMN     "productionOrderRecipeInstanceId" TEXT,
    ADD COLUMN     "recipeName" TEXT,
    DROP COLUMN "operationType",
    ADD COLUMN     "operationType" "EnumBatchOperationType";

    -- AlterTable
    ALTER TABLE "BomItem" ALTER COLUMN "isClassDefinition" SET DEFAULT true;

    -- AlterTable
    ALTER TABLE "FermentationChemistry" DROP COLUMN "lotId";

    -- AlterTable
    ALTER TABLE "Inventory" ALTER COLUMN "schemaVersion" SET DEFAULT '0001-b';

    -- AlterTable
    ALTER TABLE "ItemReceipt" DROP COLUMN "assetId",
    ADD COLUMN     "lots" JSONB,
    ADD COLUMN     "toAssetId" TEXT;

    -- AlterTable
    ALTER TABLE "Lot" ADD COLUMN     "avgBblFillByPg" DOUBLE PRECISION,
    ADD COLUMN     "avgBblFillByWg" DOUBLE PRECISION,
    ADD COLUMN     "avgPGsFerm" DOUBLE PRECISION,
    ADD COLUMN     "bblEntryProof" DOUBLE PRECISION,
    ADD COLUMN     "bblOem" TEXT,
    ADD COLUMN     "bblTotal" INTEGER,
    ADD COLUMN     "bblType" TEXT,
    ADD COLUMN     "confirmed" BOOLEAN DEFAULT false,
    ADD COLUMN     "densityFinal" DOUBLE PRECISION,
    ADD COLUMN     "fromAssetId" TEXT,
    ADD COLUMN     "grainLbsFerm" DOUBLE PRECISION,
    ADD COLUMN     "grainLbsPg" DOUBLE PRECISION,
    ADD COLUMN     "notes" TEXT,
    ADD COLUMN     "pgLosses" DOUBLE PRECISION,
    ADD COLUMN     "standardYield" DOUBLE PRECISION,
    ADD COLUMN     "totalFermenters" DOUBLE PRECISION,
    ADD COLUMN     "totalPGs" DOUBLE PRECISION,
    ADD COLUMN     "totalPGsByRecipe" DOUBLE PRECISION,
    ADD COLUMN     "totalVolumeWg" DOUBLE PRECISION,
    ADD COLUMN     "totalWGs" DOUBLE PRECISION,
    ADD COLUMN     "totalWeight" DOUBLE PRECISION,
    ADD COLUMN     "warehouseEntryNumber" INTEGER,
    ADD COLUMN     "whiskeyType" "EnumLotWhiskeyType";

    -- AlterTable
    ALTER TABLE "ProductionOrder" DROP COLUMN "salesOrderId";

    -- AlterTable
    ALTER TABLE "Recipe" ADD COLUMN     "classIdId" TEXT,
    ADD COLUMN     "cooksPerFerm" INTEGER DEFAULT 3,
    ADD COLUMN     "estimatedAbv" DOUBLE PRECISION,
    ADD COLUMN     "isClassDefinition" BOOLEAN DEFAULT true,
    ADD COLUMN     "mashingProtocolId" TEXT,
    ADD COLUMN     "recipeParameterId" TEXT,
    ADD COLUMN     "targetProof" DOUBLE PRECISION,
    ADD COLUMN     "totalCooks" INTEGER,
    ADD COLUMN     "totalFermenters" INTEGER;

    -- AlterTable
    ALTER TABLE "SalesOrder" ADD COLUMN     "productionOrderId" TEXT;

    -- AlterTable
    ALTER TABLE "ScheduleOrderQueue" ADD COLUMN     "nextOperation" "EnumScheduleOrderQueueNextOperation",
    ALTER COLUMN "nextUnitProcedureId" DROP NOT NULL,
    ALTER COLUMN "nextUnitProcedureName" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "TestParameter" ALTER COLUMN "testPass" SET DEFAULT false,
    ALTER COLUMN "testSetpointBooleanValue" DROP DEFAULT;

    -- DropTable
    DROP TABLE "ProductionOrderUnitProcedure";

    -- DropTable
    DROP TABLE "_RecipeToRecipeParameter";

     -- DropEnum
    DROP TYPE "EnumProductionOrderUnitProcedureAbbreviation";

    -- DropEnum
    DROP TYPE "EnumProductionOrderUnitProcedureStatus";

    -- CreateTable
    CREATE TABLE "RecipeBomItem" (
        "batchId" TEXT,
        "classIdid" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT NOT NULL,
        "globalId" TEXT,
        "id" TEXT NOT NULL,
        "isClassDefinition" BOOLEAN DEFAULT false,
        "itemId" TEXT,
        "lot" TEXT,
        "operation" "EnumRecipeBomItemOperation" NOT NULL,
        "operationIndex" INTEGER NOT NULL DEFAULT -1,
        "quantity" DOUBLE PRECISION,
        "quantityActual" DOUBLE PRECISION,
        "units" TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "updatedBy" TIMESTAMP(3),

        CONSTRAINT "RecipeBomItem_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "MashingProtocol" (
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT NOT NULL,
        "id" TEXT NOT NULL,
        "master" BOOLEAN DEFAULT false,
        "masterMashingProtocolId" TEXT,
        "name" TEXT NOT NULL,
        "revision" TEXT,
        "running" BOOLEAN DEFAULT false,
        "runningMashingProtocolId" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "updatedBy" TEXT,

        CONSTRAINT "MashingProtocol_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "MashingProtocolStep" (
        "agitatorEnabled" BOOLEAN DEFAULT false,
        "agitatorSpdSp" DOUBLE PRECISION,
        "coolEnabled" BOOLEAN DEFAULT false,
        "coolTempSp" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT NOT NULL,
        "heatEnabled" BOOLEAN DEFAULT false,
        "heatTempSp" DOUBLE PRECISION,
        "holdType" "EnumMashingProtocolStepHoldType",
        "id" TEXT NOT NULL,
        "index" INTEGER,
        "isClassDefinition" BOOLEAN DEFAULT false,
        "mashingProtocolId" TEXT,
        "promptMessage" TEXT,
        "stepTime" INTEGER,
        "stepType" "EnumMashingProtocolStepStepType",
        "temperatureActual" DOUBLE PRECISION,
        "temperatureSetpoint" DOUBLE PRECISION,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "updatedBy" TEXT,

        CONSTRAINT "MashingProtocolStep_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "RecipeBom" (
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "id" TEXT NOT NULL,
        "master" BOOLEAN DEFAULT false,
        "masterReceipeBomId" TEXT,
        "recipeBomITemId" TEXT NOT NULL,
        "revision" TEXT,
        "running" BOOLEAN DEFAULT false,
        "runningRecipeBomId" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "RecipeBom_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "ProductionOrderRecipeInstance" (
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT NOT NULL,
        "id" TEXT NOT NULL,
        "productionOrderId" TEXT NOT NULL,
        "recipeId" TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "updatedBy" TEXT,

        CONSTRAINT "ProductionOrderRecipeInstance_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "MashingDatum" (
        "assetId" TEXT,
        "backsetQuantity" INTEGER,
        "bomId" TEXT,
        "cookCompleteTime" TIMESTAMP(3),
        "cookDropTime" TIMESTAMP(3),
        "cookDuration" INTEGER,
        "cookStartTime" TIMESTAMP(3),
        "cookStartedBy" TEXT,
        "cookerNumber" INTEGER,
        "cornQuantity" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "dropDuration" INTEGER,
        "id" TEXT NOT NULL,
        "maltQuantity" INTEGER,
        "operationId" TEXT,
        "preMaltQuantity" INTEGER,
        "recipeBomId" TEXT,
        "ryeQuantity" INTEGER,
        "specialtyQuantity" INTEGER,
        "totalDuration" INTEGER,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "waterQuantity" INTEGER,
        "wheatQuantity" INTEGER,

        CONSTRAINT "MashingDatum_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "AdditiveActual" (
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "id" TEXT NOT NULL,
        "itemId" TEXT,
        "itemNumber" TEXT NOT NULL,
        "lotNumber" TEXT NOT NULL,
        "mashingDatumId" TEXT,
        "quantity" INTEGER NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "AdditiveActual_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "_RecipeToRecipeBom" (
        "A" TEXT NOT NULL,
        "B" TEXT NOT NULL
    );

    -- CreateTable
    CREATE TABLE "_MashingProtocolToProductionOrderRecipeInstance" (
        "A" TEXT NOT NULL,
        "B" TEXT NOT NULL
    );

    -- CreateTable
    CREATE TABLE "_MashingProtocolStepToRecipeBomItem" (
        "A" TEXT NOT NULL,
        "B" TEXT NOT NULL
    );

    -- CreateTable
    CREATE TABLE "_ProductionOrderRecipeInstanceToRecipeBom" (
        "A" TEXT NOT NULL,
        "B" TEXT NOT NULL
    );

    -- CreateIndex
    CREATE UNIQUE INDEX "RecipeBomItem_globalId_key" ON "RecipeBomItem"("globalId");

    -- CreateIndex
    CREATE UNIQUE INDEX "MashingProtocol_name_key" ON "MashingProtocol"("name");

    -- CreateIndex
    CREATE UNIQUE INDEX "_RecipeToRecipeBom_AB_unique" ON "_RecipeToRecipeBom"("A", "B");

    -- CreateIndex
    CREATE INDEX "_RecipeToRecipeBom_B_index" ON "_RecipeToRecipeBom"("B");

    -- CreateIndex
    CREATE UNIQUE INDEX "_MashingProtocolToProductionOrderRecipeInstance_AB_unique" ON "_MashingProtocolToProductionOrderRecipeInstance"("A", "B");

    -- CreateIndex
    CREATE INDEX "_MashingProtocolToProductionOrderRecipeInstance_B_index" ON "_MashingProtocolToProductionOrderRecipeInstance"("B");

    -- CreateIndex
    CREATE UNIQUE INDEX "_MashingProtocolStepToRecipeBomItem_AB_unique" ON "_MashingProtocolStepToRecipeBomItem"("A", "B");

    -- CreateIndex
    CREATE INDEX "_MashingProtocolStepToRecipeBomItem_B_index" ON "_MashingProtocolStepToRecipeBomItem"("B");

    -- CreateIndex
    CREATE UNIQUE INDEX "_ProductionOrderRecipeInstanceToRecipeBom_AB_unique" ON "_ProductionOrderRecipeInstanceToRecipeBom"("A", "B");

    -- CreateIndex
    CREATE INDEX "_ProductionOrderRecipeInstanceToRecipeBom_B_index" ON "_ProductionOrderRecipeInstanceToRecipeBom"("B");

    -- AddForeignKey
    ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_mashingProtocolId_fkey" FOREIGN KEY ("mashingProtocolId") REFERENCES "MashingProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_recipeParameterId_fkey" FOREIGN KEY ("recipeParameterId") REFERENCES "RecipeParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "ScheduleOrderQueue" ADD CONSTRAINT "ScheduleOrderQueue_nextUnitProcedureId_fkey" FOREIGN KEY ("nextUnitProcedureId") REFERENCES "UnitProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "ItemReceipt" ADD CONSTRAINT "ItemReceipt_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Lot" ADD CONSTRAINT "Lot_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_mashingProtocolId_fkey" FOREIGN KEY ("mashingProtocolId") REFERENCES "MashingProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productionOrderRecipeInstanceId_fkey" FOREIGN KEY ("productionOrderRecipeInstanceId") REFERENCES "ProductionOrderRecipeInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "RecipeBomItem" ADD CONSTRAINT "RecipeBomItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "RecipeBomItem" ADD CONSTRAINT "RecipeBomItem_classIdid_fkey" FOREIGN KEY ("classIdid") REFERENCES "RecipeBomItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "RecipeBomItem" ADD CONSTRAINT "RecipeBomItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingProtocol" ADD CONSTRAINT "MashingProtocol_masterMashingProtocolId_fkey" FOREIGN KEY ("masterMashingProtocolId") REFERENCES "MashingProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingProtocol" ADD CONSTRAINT "MashingProtocol_runningMashingProtocolId_fkey" FOREIGN KEY ("runningMashingProtocolId") REFERENCES "MashingProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingProtocolStep" ADD CONSTRAINT "MashingProtocolStep_mashingProtocolId_fkey" FOREIGN KEY ("mashingProtocolId") REFERENCES "MashingProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "RecipeBom" ADD CONSTRAINT "RecipeBom_masterReceipeBomId_fkey" FOREIGN KEY ("masterReceipeBomId") REFERENCES "RecipeBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "RecipeBom" ADD CONSTRAINT "RecipeBom_recipeBomITemId_fkey" FOREIGN KEY ("recipeBomITemId") REFERENCES "RecipeBomItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "RecipeBom" ADD CONSTRAINT "RecipeBom_runningRecipeBomId_fkey" FOREIGN KEY ("runningRecipeBomId") REFERENCES "RecipeBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "ProductionOrderRecipeInstance" ADD CONSTRAINT "ProductionOrderRecipeInstance_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "ProductionOrderRecipeInstance" ADD CONSTRAINT "ProductionOrderRecipeInstance_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingDatum" ADD CONSTRAINT "MashingDatum_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingDatum" ADD CONSTRAINT "MashingDatum_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingDatum" ADD CONSTRAINT "MashingDatum_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "MashingDatum" ADD CONSTRAINT "MashingDatum_recipeBomId_fkey" FOREIGN KEY ("recipeBomId") REFERENCES "RecipeBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AdditiveActual" ADD CONSTRAINT "AdditiveActual_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AdditiveActual" ADD CONSTRAINT "AdditiveActual_mashingDatumId_fkey" FOREIGN KEY ("mashingDatumId") REFERENCES "MashingDatum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_RecipeToRecipeBom" ADD CONSTRAINT "_RecipeToRecipeBom_A_fkey" FOREIGN KEY ("A") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_RecipeToRecipeBom" ADD CONSTRAINT "_RecipeToRecipeBom_B_fkey" FOREIGN KEY ("B") REFERENCES "RecipeBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_MashingProtocolToProductionOrderRecipeInstance" ADD CONSTRAINT "_MashingProtocolToProductionOrderRecipeInstance_A_fkey" FOREIGN KEY ("A") REFERENCES "MashingProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_MashingProtocolToProductionOrderRecipeInstance" ADD CONSTRAINT "_MashingProtocolToProductionOrderRecipeInstance_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductionOrderRecipeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_MashingProtocolStepToRecipeBomItem" ADD CONSTRAINT "_MashingProtocolStepToRecipeBomItem_A_fkey" FOREIGN KEY ("A") REFERENCES "MashingProtocolStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_MashingProtocolStepToRecipeBomItem" ADD CONSTRAINT "_MashingProtocolStepToRecipeBomItem_B_fkey" FOREIGN KEY ("B") REFERENCES "RecipeBomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_ProductionOrderRecipeInstanceToRecipeBom" ADD CONSTRAINT "_ProductionOrderRecipeInstanceToRecipeBom_A_fkey" FOREIGN KEY ("A") REFERENCES "ProductionOrderRecipeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "_ProductionOrderRecipeInstanceToRecipeBom" ADD CONSTRAINT "_ProductionOrderRecipeInstanceToRecipeBom_B_fkey" FOREIGN KEY ("B") REFERENCES "RecipeBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
