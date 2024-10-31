/*
  Warnings:

  - You are about to drop the column `itemId` on the `Lot` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[continerItemId]` on the table `Lot` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EnumAssetStatus" AS ENUM ('OOS', 'InService');

-- DropForeignKey
ALTER TABLE "Lot" DROP CONSTRAINT "Lot_itemId_fkey";

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "status" "EnumAssetStatus" DEFAULT 'InService';

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "durationSplits" JSONB,
ADD COLUMN     "totalDuration" INTEGER;

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "itemReceiptId" TEXT,
ALTER COLUMN "units" SET DEFAULT 'lbs';

-- AlterTable
ALTER TABLE "Lot" DROP COLUMN "itemId",
ADD COLUMN     "continerItemId" TEXT;

-- CreateTable
CREATE TABLE "_ItemOnLots" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ItemOnLots_AB_unique" ON "_ItemOnLots"("A", "B");

-- CreateIndex
CREATE INDEX "_ItemOnLots_B_index" ON "_ItemOnLots"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_continerItemId_key" ON "Lot"("continerItemId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_continerItemId_fkey" FOREIGN KEY ("continerItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_itemReceiptId_fkey" FOREIGN KEY ("itemReceiptId") REFERENCES "ItemReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemOnLots" ADD CONSTRAINT "_ItemOnLots_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemOnLots" ADD CONSTRAINT "_ItemOnLots_B_fkey" FOREIGN KEY ("B") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
