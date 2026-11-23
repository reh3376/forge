/*
  Warnings:

  - You are about to drop the column `estimatedAbv` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `itemId` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `targetProof` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `totalCooks` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `totalFermenters` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `classIdId` on the `RecipeParameter` table. All the data in the column will be lost.
  - You are about to drop the column `recipeParamUnits` on the `RecipeParameter` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[globalId]` on the table `RecipeParameter` will be added. If there are existing duplicate values, this will fail.
  - Made the column `updatedAt` on table `RecipeParameter` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "EnumProductionOrderContainerType" AS ENUM ('LargeBarrel', 'SmallBarrel', 'BulkLoadout', 'PlasticDrum', 'IbcTote275', 'SsTote275');

-- CreateEnum
CREATE TYPE "EnumUnitsPerOperation" AS ENUM ('PerCook', 'PerFermenter', 'PerLot', 'PerBarrel');

-- DropForeignKey
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_itemId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeParameter" DROP CONSTRAINT "RecipeParameter_classIdId_fkey";

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "completedCooks" INTEGER,
ADD COLUMN     "completedFermenters" INTEGER,
ADD COLUMN     "completedQuantity" DECIMAL(65,30),
ADD COLUMN     "containerType" "EnumProductionOrderContainerType" DEFAULT 'LargeBarrel',
ADD COLUMN     "plannedCooks" INTEGER,
ADD COLUMN     "plannedFermenters" INTEGER;

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "estimatedAbv",
DROP COLUMN "itemId",
DROP COLUMN "targetProof",
DROP COLUMN "totalCooks",
DROP COLUMN "totalFermenters";

-- AlterTable
ALTER TABLE "RecipeParameter" DROP COLUMN "classIdId",
DROP COLUMN "recipeParamUnits",
ADD COLUMN     "configurable" BOOLEAN DEFAULT true,
ADD COLUMN     "operationId" TEXT,
ADD COLUMN     "unitsId" TEXT,
ALTER COLUMN "recipeSetpointType" DROP NOT NULL,
ALTER COLUMN "recipeParamName" DROP NOT NULL,
ALTER COLUMN "className" DROP NOT NULL,
ALTER COLUMN "active" DROP NOT NULL,
ALTER COLUMN "active" DROP DEFAULT,
ALTER COLUMN "createdBy" DROP NOT NULL,
ALTER COLUMN "recipeSetpointBooleanValue" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "Units" (
    "abbreviation" TEXT NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "conversions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "perOperation" "EnumUnitsPerOperation",
    "revision" INTEGER DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TIMESTAMP(3),

    CONSTRAINT "Units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_containerItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_containerItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Units_name_revision_key" ON "Units"("name", "revision");

-- CreateIndex
CREATE INDEX "_containerItem_B_index" ON "_containerItem"("B");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeParameter_globalId_key" ON "RecipeParameter"("globalId");

-- AddForeignKey
ALTER TABLE "RecipeParameter" ADD CONSTRAINT "RecipeParameter_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeParameter" ADD CONSTRAINT "RecipeParameter_unitsId_fkey" FOREIGN KEY ("unitsId") REFERENCES "Units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_containerItem" ADD CONSTRAINT "_containerItem_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_containerItem" ADD CONSTRAINT "_containerItem_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
