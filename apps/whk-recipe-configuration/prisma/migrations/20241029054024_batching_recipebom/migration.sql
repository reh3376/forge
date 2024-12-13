/*
  Warnings:

  - You are about to drop the column `recipeBomITemId` on the `RecipeBom` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "RecipeBom" DROP CONSTRAINT "RecipeBom_recipeBomITemId_fkey";

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "productionOrderId" TEXT;

-- AlterTable
ALTER TABLE "RecipeBom" DROP COLUMN "recipeBomITemId";

-- AlterTable
ALTER TABLE "RecipeBomItem" ADD COLUMN     "recipeBomsId" TEXT;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBomItem" ADD CONSTRAINT "RecipeBomItem_recipeBomsId_fkey" FOREIGN KEY ("recipeBomsId") REFERENCES "RecipeBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
