/*
  Warnings:

  - The values [String] on the enum `EnumRecipeParameterRecipeSetpointType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `recipeParameterId` on the `Recipe` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "EnumRecipeParameterOperation" AS ENUM ('Mashing01', 'Ferrmentation01', 'Distillation01', 'Processing01');

-- AlterEnum
BEGIN;
CREATE TYPE "EnumRecipeParameterRecipeSetpointType_new" AS ENUM ('Boolean', 'Numeric', 'Text');
ALTER TABLE "RecipeParameter" ALTER COLUMN "recipeSetpointType" TYPE "EnumRecipeParameterRecipeSetpointType_new" USING ("recipeSetpointType"::text::"EnumRecipeParameterRecipeSetpointType_new");
ALTER TYPE "EnumRecipeParameterRecipeSetpointType" RENAME TO "EnumRecipeParameterRecipeSetpointType_old";
ALTER TYPE "EnumRecipeParameterRecipeSetpointType_new" RENAME TO "EnumRecipeParameterRecipeSetpointType";
DROP TYPE "EnumRecipeParameterRecipeSetpointType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_recipeParameterId_fkey";

-- DropIndex
DROP INDEX "Recipe_itemId_customerId_key";

-- DropIndex
DROP INDEX "ScheduleOrderQueue_nextUnitProcedureId_key";

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "recipeParameterId";

-- CreateTable
CREATE TABLE "_RecipeToRecipeParameter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToRecipeParameter_AB_unique" ON "_RecipeToRecipeParameter"("A", "B");

-- CreateIndex
CREATE INDEX "_RecipeToRecipeParameter_B_index" ON "_RecipeToRecipeParameter"("B");

-- AddForeignKey
ALTER TABLE "_RecipeToRecipeParameter" ADD CONSTRAINT "_RecipeToRecipeParameter_A_fkey" FOREIGN KEY ("A") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToRecipeParameter" ADD CONSTRAINT "_RecipeToRecipeParameter_B_fkey" FOREIGN KEY ("B") REFERENCES "RecipeParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
