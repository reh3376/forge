/*
  Warnings:

  - You are about to drop the `_MashingProtocolToProductionOrderRecipeInstance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_ProductionOrderRecipeInstanceToRecipeBom` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `mashingProtocolId` to the `MashingProtocolStepActual` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_MashingProtocolToProductionOrderRecipeInstance" DROP CONSTRAINT "_MashingProtocolToProductionOrderRecipeInstance_A_fkey";

-- DropForeignKey
ALTER TABLE "_MashingProtocolToProductionOrderRecipeInstance" DROP CONSTRAINT "_MashingProtocolToProductionOrderRecipeInstance_B_fkey";

-- DropForeignKey
ALTER TABLE "_ProductionOrderRecipeInstanceToRecipeBom" DROP CONSTRAINT "_ProductionOrderRecipeInstanceToRecipeBom_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProductionOrderRecipeInstanceToRecipeBom" DROP CONSTRAINT "_ProductionOrderRecipeInstanceToRecipeBom_B_fkey";

-- AlterTable
ALTER TABLE "MashingProtocol" ADD COLUMN     "productionOrderRecipeInstancesId" TEXT;

-- AlterTable
ALTER TABLE "MashingProtocolStepActual" ADD COLUMN     "mashingProtocolId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "millingBinConfigurationId" TEXT,
ALTER COLUMN "updatedBy" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "RecipeBom" ADD COLUMN     "productionOrderRecipeInstancesId" TEXT;

-- AlterTable
ALTER TABLE "RecipeBomActual" ADD COLUMN     "productionOrderRecipeInstanceId" TEXT;

-- DropTable
DROP TABLE "_MashingProtocolToProductionOrderRecipeInstance";

-- DropTable
DROP TABLE "_ProductionOrderRecipeInstanceToRecipeBom";

-- CreateTable
CREATE TABLE "MillingBinConfiguration" (
    "binId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "itemGroupId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MillingBinConfiguration_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_millingBinConfigurationId_fkey" FOREIGN KEY ("millingBinConfigurationId") REFERENCES "MillingBinConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MashingProtocol" ADD CONSTRAINT "MashingProtocol_productionOrderRecipeInstancesId_fkey" FOREIGN KEY ("productionOrderRecipeInstancesId") REFERENCES "ProductionOrderRecipeInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBom" ADD CONSTRAINT "RecipeBom_productionOrderRecipeInstancesId_fkey" FOREIGN KEY ("productionOrderRecipeInstancesId") REFERENCES "ProductionOrderRecipeInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MashingProtocolStepActual" ADD CONSTRAINT "MashingProtocolStepActual_mashingProtocolId_fkey" FOREIGN KEY ("mashingProtocolId") REFERENCES "MashingProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBomActual" ADD CONSTRAINT "RecipeBomActual_productionOrderRecipeInstanceId_fkey" FOREIGN KEY ("productionOrderRecipeInstanceId") REFERENCES "ProductionOrderRecipeInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MillingBinConfiguration" ADD CONSTRAINT "MillingBinConfiguration_binId_fkey" FOREIGN KEY ("binId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MillingBinConfiguration" ADD CONSTRAINT "MillingBinConfiguration_itemGroupId_fkey" FOREIGN KEY ("itemGroupId") REFERENCES "ItemGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
