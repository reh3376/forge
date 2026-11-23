/*
  Warnings:

  - You are about to drop the column `parameterId` on the `Recipe` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `SalesOrder` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `SalesOrder` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_parameterId_fkey";

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "parameterData" JSONB;

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "units" TEXT;

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "parameterId";

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "name" TEXT,
ADD COLUMN     "requestedShipDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "_PhaseParameterToRecipe" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_PhaseParameterToRecipe_AB_unique" ON "_PhaseParameterToRecipe"("A", "B");

-- CreateIndex
CREATE INDEX "_PhaseParameterToRecipe_B_index" ON "_PhaseParameterToRecipe"("B");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_name_key" ON "SalesOrder"("name");

-- AddForeignKey
ALTER TABLE "_PhaseParameterToRecipe" ADD CONSTRAINT "_PhaseParameterToRecipe_A_fkey" FOREIGN KEY ("A") REFERENCES "PhaseParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhaseParameterToRecipe" ADD CONSTRAINT "_PhaseParameterToRecipe_B_fkey" FOREIGN KEY ("B") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
