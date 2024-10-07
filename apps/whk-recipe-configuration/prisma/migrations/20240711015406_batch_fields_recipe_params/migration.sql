/*
  Warnings:

  - You are about to drop the column `batch` on the `RecipeParameter` table. All the data in the column will be lost.
  - You are about to drop the column `editedAt` on the `RecipeParameter` table. All the data in the column will be lost.
  - You are about to drop the column `editedBy` on the `RecipeParameter` table. All the data in the column will be lost.
  - You are about to drop the column `itemId` on the `RecipeParameter` table. All the data in the column will be lost.
  - You are about to drop the column `sequencerParameters` on the `RecipeParameter` table. All the data in the column will be lost.
  - The `recipeParamUnits` column on the `RecipeParameter` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `scheduleOrderId` on the `ScheduleOrderQueue` table. All the data in the column will be lost.
  - You are about to drop the `_PhaseParameterToRecipe` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[scheduleOrderQueueId]` on the table `ScheduleOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[queueIndex]` on the table `ScheduleOrderQueue` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "EnumRecipeParameterRecipeSetpointType" ADD VALUE 'Text';

-- DropForeignKey
ALTER TABLE "ScheduleOrderQueue" DROP CONSTRAINT "ScheduleOrderQueue_scheduleOrderId_fkey";

-- DropForeignKey
ALTER TABLE "_PhaseParameterToRecipe" DROP CONSTRAINT "_PhaseParameterToRecipe_A_fkey";

-- DropForeignKey
ALTER TABLE "_PhaseParameterToRecipe" DROP CONSTRAINT "_PhaseParameterToRecipe_B_fkey";

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "assetPath" TEXT,
ADD COLUMN     "batchInitData" JSONB,
ADD COLUMN     "recipeId" TEXT;

-- AlterTable
ALTER TABLE "RecipeParameter" DROP COLUMN "batch",
DROP COLUMN "editedAt",
DROP COLUMN "editedBy",
DROP COLUMN "itemId",
DROP COLUMN "sequencerParameters",
ADD COLUMN     "recipeNumericalSetpoint" DECIMAL(65,30),
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "updatedBy" TEXT,
DROP COLUMN "recipeParamUnits",
ADD COLUMN     "recipeParamUnits" TEXT;

-- AlterTable
ALTER TABLE "ScheduleOrder" ADD COLUMN     "scheduleOrderQueueId" TEXT;

-- AlterTable
ALTER TABLE "ScheduleOrderQueue" DROP COLUMN "scheduleOrderId";

-- DropTable
DROP TABLE "_PhaseParameterToRecipe";

-- DropEnum
DROP TYPE "EnumRecipeParameterRecipeParamUnits";

-- CreateTable
CREATE TABLE "_RecipeToRecipeParameter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToRecipeParameter_AB_unique" ON "_RecipeToRecipeParameter"("A", "B");

-- CreateIndex
CREATE INDEX "_RecipeToRecipeParameter_B_index" ON "_RecipeToRecipeParameter"("B");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrder_scheduleOrderQueueId_key" ON "ScheduleOrder"("scheduleOrderQueueId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrderQueue_queueIndex_key" ON "ScheduleOrderQueue"("queueIndex");

-- AddForeignKey
ALTER TABLE "ScheduleOrder" ADD CONSTRAINT "ScheduleOrder_scheduleOrderQueueId_fkey" FOREIGN KEY ("scheduleOrderQueueId") REFERENCES "ScheduleOrderQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToRecipeParameter" ADD CONSTRAINT "_RecipeToRecipeParameter_A_fkey" FOREIGN KEY ("A") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToRecipeParameter" ADD CONSTRAINT "_RecipeToRecipeParameter_B_fkey" FOREIGN KEY ("B") REFERENCES "RecipeParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
