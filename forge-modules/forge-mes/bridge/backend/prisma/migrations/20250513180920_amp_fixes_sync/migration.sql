/*
  Warnings:

  - The values [Ferrmentation01] on the enum `EnumRecipeParameterOperation` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `_BomItemToEquipmentPhase` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_CustomerToScheduleOrder` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_EquipmentPhaseToInstruction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_EquipmentPhaseToPhaseParameter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_EquipmentPhaseToTestParameter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ItemOnLots` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ItemToPurchaseOrder` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ItemToSalesOrder` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ItemToTestParameter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_MashingProtocolStepToRecipeBomItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_MashingProtocolToProductionOrderRecipeInstance` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ProductionOrderRecipeInstanceToRecipeBom` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_PurchaseOrderToTestParameter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_RecipeToRecipeBom` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_RecipeToRecipeParameter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_RecipeToUnitProcedure` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_UnsBrokerConfigurationToUnsConfiguration` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_containerItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_inventoryTransfersTo` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_BomItemToEquipmentPhase` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_CustomerToScheduleOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_EquipmentPhaseToInstruction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_EquipmentPhaseToPhaseParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_EquipmentPhaseToTestParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_ItemOnLots` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_ItemToPurchaseOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_ItemToSalesOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_ItemToTestParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_MashingProtocolStepToRecipeBomItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_MashingProtocolToProductionOrderRecipeInstance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_ProductionOrderRecipeInstanceToRecipeBom` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_PurchaseOrderToTestParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_RecipeToRecipeBom` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_RecipeToRecipeParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_RecipeToUnitProcedure` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_UnsBrokerConfigurationToUnsConfiguration` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_containerItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_inventoryTransfersTo` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EnumRecipeParameterOperation_new" AS ENUM ('Mashing01', 'Fermentation01', 'Distillation01', 'Processing01');
ALTER TYPE "EnumRecipeParameterOperation" RENAME TO "EnumRecipeParameterOperation_old";
ALTER TYPE "EnumRecipeParameterOperation_new" RENAME TO "EnumRecipeParameterOperation";
DROP TYPE "EnumRecipeParameterOperation_old";
COMMIT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "estimatedAbv" DOUBLE PRECISION,
ADD COLUMN     "targetProof" DOUBLE PRECISION,
ADD COLUMN     "totalCooks" INTEGER,
ADD COLUMN     "totalFermenters" INTEGER;

-- AlterTable
ALTER TABLE "_BomItemToEquipmentPhase" DROP CONSTRAINT "_BomItemToEquipmentPhase_AB_pkey";

-- AlterTable
ALTER TABLE "_CustomerToScheduleOrder" DROP CONSTRAINT "_CustomerToScheduleOrder_AB_pkey";

-- AlterTable
ALTER TABLE "_EquipmentPhaseToInstruction" DROP CONSTRAINT "_EquipmentPhaseToInstruction_AB_pkey";

-- AlterTable
ALTER TABLE "_EquipmentPhaseToPhaseParameter" DROP CONSTRAINT "_EquipmentPhaseToPhaseParameter_AB_pkey";

-- AlterTable
ALTER TABLE "_EquipmentPhaseToTestParameter" DROP CONSTRAINT "_EquipmentPhaseToTestParameter_AB_pkey";

-- AlterTable
ALTER TABLE "_ItemOnLots" DROP CONSTRAINT "_ItemOnLots_AB_pkey";

-- AlterTable
ALTER TABLE "_ItemToPurchaseOrder" DROP CONSTRAINT "_ItemToPurchaseOrder_AB_pkey";

-- AlterTable
ALTER TABLE "_ItemToSalesOrder" DROP CONSTRAINT "_ItemToSalesOrder_AB_pkey";

-- AlterTable
ALTER TABLE "_ItemToTestParameter" DROP CONSTRAINT "_ItemToTestParameter_AB_pkey";

-- AlterTable
ALTER TABLE "_MashingProtocolStepToRecipeBomItem" DROP CONSTRAINT "_MashingProtocolStepToRecipeBomItem_AB_pkey";

-- AlterTable
ALTER TABLE "_MashingProtocolToProductionOrderRecipeInstance" DROP CONSTRAINT "_MashingProtocolToProductionOrderRecipeInstance_AB_pkey";

-- AlterTable
ALTER TABLE "_ProductionOrderRecipeInstanceToRecipeBom" DROP CONSTRAINT "_ProductionOrderRecipeInstanceToRecipeBom_AB_pkey";

-- AlterTable
ALTER TABLE "_PurchaseOrderToTestParameter" DROP CONSTRAINT "_PurchaseOrderToTestParameter_AB_pkey";

-- AlterTable
ALTER TABLE "_RecipeToRecipeBom" DROP CONSTRAINT "_RecipeToRecipeBom_AB_pkey";

-- AlterTable
ALTER TABLE "_RecipeToRecipeParameter" DROP CONSTRAINT "_RecipeToRecipeParameter_AB_pkey";

-- AlterTable
ALTER TABLE "_RecipeToUnitProcedure" DROP CONSTRAINT "_RecipeToUnitProcedure_AB_pkey";

-- AlterTable
ALTER TABLE "_UnsBrokerConfigurationToUnsConfiguration" DROP CONSTRAINT "_UnsBrokerConfigurationToUnsConfiguration_AB_pkey";

-- AlterTable
ALTER TABLE "_containerItem" DROP CONSTRAINT "_containerItem_AB_pkey";

-- AlterTable
ALTER TABLE "_inventoryTransfersTo" DROP CONSTRAINT "_inventoryTransfersTo_AB_pkey";

-- CreateIndex
CREATE UNIQUE INDEX "_BomItemToEquipmentPhase_AB_unique" ON "_BomItemToEquipmentPhase"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_CustomerToScheduleOrder_AB_unique" ON "_CustomerToScheduleOrder"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentPhaseToInstruction_AB_unique" ON "_EquipmentPhaseToInstruction"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentPhaseToPhaseParameter_AB_unique" ON "_EquipmentPhaseToPhaseParameter"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentPhaseToTestParameter_AB_unique" ON "_EquipmentPhaseToTestParameter"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemOnLots_AB_unique" ON "_ItemOnLots"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemToPurchaseOrder_AB_unique" ON "_ItemToPurchaseOrder"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemToSalesOrder_AB_unique" ON "_ItemToSalesOrder"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemToTestParameter_AB_unique" ON "_ItemToTestParameter"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_MashingProtocolStepToRecipeBomItem_AB_unique" ON "_MashingProtocolStepToRecipeBomItem"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_MashingProtocolToProductionOrderRecipeInstance_AB_unique" ON "_MashingProtocolToProductionOrderRecipeInstance"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProductionOrderRecipeInstanceToRecipeBom_AB_unique" ON "_ProductionOrderRecipeInstanceToRecipeBom"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_PurchaseOrderToTestParameter_AB_unique" ON "_PurchaseOrderToTestParameter"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToRecipeBom_AB_unique" ON "_RecipeToRecipeBom"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToRecipeParameter_AB_unique" ON "_RecipeToRecipeParameter"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToUnitProcedure_AB_unique" ON "_RecipeToUnitProcedure"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_UnsBrokerConfigurationToUnsConfiguration_AB_unique" ON "_UnsBrokerConfigurationToUnsConfiguration"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_containerItem_AB_unique" ON "_containerItem"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_inventoryTransfersTo_AB_unique" ON "_inventoryTransfersTo"("A", "B");
