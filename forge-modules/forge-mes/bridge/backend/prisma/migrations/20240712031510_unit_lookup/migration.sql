/*
  Warnings:

  - You are about to drop the column `type` on the `Asset` table. All the data in the column will be lost.
  - Added the required column `assetType` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EnumAssetAssetType" AS ENUM ('ENT', 'SITE', 'AREA', 'LINE', 'CELL', 'EQUIPMOD', 'EQUIPPHASE', 'CONTROLMOD', 'UNIT', 'DEVICE');

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "type",
ADD COLUMN     "assetType" "EnumAssetAssetType" NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "vendorId" TEXT;

-- DropEnum
DROP TYPE "EnumAssetType";

-- CreateTable
CREATE TABLE "UnitLookup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "conversionRate" DECIMAL(65,30),
    "name" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "pluralAbbreviation" TEXT NOT NULL,
    "pluralName" TEXT NOT NULL,
    "baseUnit" BOOLEAN DEFAULT false,
    "baseRecordId" TEXT,

    CONSTRAINT "UnitLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitLookup_name_key" ON "UnitLookup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitLookup_abbreviation_key" ON "UnitLookup"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "UnitLookup_pluralAbbreviation_key" ON "UnitLookup"("pluralAbbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "UnitLookup_pluralName_key" ON "UnitLookup"("pluralName");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitLookup" ADD CONSTRAINT "UnitLookup_baseRecordId_fkey" FOREIGN KEY ("baseRecordId") REFERENCES "UnitLookup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
