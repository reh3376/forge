/*
  Warnings:

  - You are about to drop the column `recipeGroupId` on the `ProductionOrder` table. All the data in the column will be lost.
  - You are about to drop the column `units` on the `ProductionOrder` table. All the data in the column will be lost.
  - You are about to drop the column `receiptStatus` on the `PurchaseOrder` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[globalId]` on the table `Units` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EnumPurchaseOrderStatus" AS ENUM ('Planned', 'Committed', 'Initiated', 'InProgress', 'Complete');

-- DropForeignKey
ALTER TABLE "ProductionOrder" DROP CONSTRAINT "ProductionOrder_recipeGroupId_fkey";

-- AlterTable
ALTER TABLE "ProductionOrder" DROP COLUMN "recipeGroupId",
DROP COLUMN "units",
ADD COLUMN     "unitsId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" DROP COLUMN "receiptStatus",
ADD COLUMN     "status" "EnumPurchaseOrderStatus" DEFAULT 'Planned';

-- AlterTable
ALTER TABLE "Units" ADD COLUMN     "globalId" TEXT;

-- DropEnum
DROP TYPE "EnumPurchaseOrderReceiptStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Units_globalId_key" ON "Units"("globalId");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_unitsId_fkey" FOREIGN KEY ("unitsId") REFERENCES "Units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
