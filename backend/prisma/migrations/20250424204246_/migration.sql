/*
  Warnings:

  - You are about to drop the column `mashingDatumId` on the `AdditiveActual` table. All the data in the column will be lost.
  - You are about to drop the column `isClassDefinition` on the `MashingProtocolStep` table. All the data in the column will be lost.
  - You are about to drop the column `recipeBomId` on the `RecipeBomActual` table. All the data in the column will be lost.
  - You are about to drop the column `lot` on the `RecipeBomItem` table. All the data in the column will be lost.
  - You are about to drop the column `operationIndex` on the `RecipeBomItem` table. All the data in the column will be lost.
  - You are about to drop the column `quantityActual` on the `RecipeBomItem` table. All the data in the column will be lost.
  - You are about to drop the `FermentationChemistry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FermentationDayDatum` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FermentationSettingDatum` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MashDatum` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MashingDatum` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `recipeBomItemId` to the `RecipeBomActual` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EnumItemReceiptStatus" ADD VALUE 'Flagged';
ALTER TYPE "EnumItemReceiptStatus" ADD VALUE 'Confirmed';
ALTER TYPE "EnumItemReceiptStatus" ADD VALUE 'Denied';

-- DropForeignKey
ALTER TABLE "AdditiveActual" DROP CONSTRAINT "AdditiveActual_mashingDatumId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationChemistry" DROP CONSTRAINT "FermentationChemistry_assetId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationChemistry" DROP CONSTRAINT "FermentationChemistry_operationId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationChemistry" DROP CONSTRAINT "FermentationChemistry_productionOrderId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationChemistry" DROP CONSTRAINT "FermentationChemistry_settingDataId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationDayDatum" DROP CONSTRAINT "FermentationDayDatum_assetId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationDayDatum" DROP CONSTRAINT "FermentationDayDatum_fermentationChemistryId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationDayDatum" DROP CONSTRAINT "FermentationDayDatum_operationId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationDayDatum" DROP CONSTRAINT "FermentationDayDatum_productionOrderId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationSettingDatum" DROP CONSTRAINT "FermentationSettingDatum_operationId_fkey";

-- DropForeignKey
ALTER TABLE "MashDatum" DROP CONSTRAINT "MashDatum_assetId_fkey";

-- DropForeignKey
ALTER TABLE "MashDatum" DROP CONSTRAINT "MashDatum_fermentationChemistryId_fkey";

-- DropForeignKey
ALTER TABLE "MashingDatum" DROP CONSTRAINT "MashingDatum_assetId_fkey";

-- DropForeignKey
ALTER TABLE "MashingDatum" DROP CONSTRAINT "MashingDatum_bomId_fkey";

-- DropForeignKey
ALTER TABLE "MashingDatum" DROP CONSTRAINT "MashingDatum_operationId_fkey";

-- DropForeignKey
ALTER TABLE "MashingDatum" DROP CONSTRAINT "MashingDatum_recipeBomId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeBomActual" DROP CONSTRAINT "RecipeBomActual_recipeBomId_fkey";

-- AlterTable
ALTER TABLE "AdditiveActual" DROP COLUMN "mashingDatumId";

-- AlterTable
ALTER TABLE "ItemReceipt" ADD COLUMN     "comments" TEXT,
ADD COLUMN     "vendorLoadId" TEXT;

-- AlterTable
ALTER TABLE "MashingProtocolStep" DROP COLUMN "isClassDefinition";

-- AlterTable
ALTER TABLE "RecipeBomActual" DROP COLUMN "recipeBomId",
ADD COLUMN     "recipeBomItemId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RecipeBomItem" DROP COLUMN "lot",
DROP COLUMN "operationIndex",
DROP COLUMN "quantityActual";

-- DropTable
DROP TABLE "FermentationChemistry";

-- DropTable
DROP TABLE "FermentationDayDatum";

-- DropTable
DROP TABLE "FermentationSettingDatum";

-- DropTable
DROP TABLE "MashDatum";

-- DropTable
DROP TABLE "MashingDatum";

-- DropEnum
DROP TYPE "EnumFermentationDayDatumDay";

-- AddForeignKey
ALTER TABLE "RecipeBomActual" ADD CONSTRAINT "RecipeBomActual_recipeBomItemId_fkey" FOREIGN KEY ("recipeBomItemId") REFERENCES "RecipeBomItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
