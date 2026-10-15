/*
  Warnings:

  - You are about to drop the column `customer` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `itemDescription` on the `Recipe` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "EnumPhaseParameterSetpointType" ADD VALUE 'String';

-- DropIndex
DROP INDEX "EquipmentPhase_name_revision_active_isClassDefinition_stepT_key";

-- AlterTable
ALTER TABLE "PhaseParameter" ADD COLUMN     "stringValue" TEXT;

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "customer",
DROP COLUMN "itemDescription",
ADD COLUMN     "customerCode" TEXT,
ADD COLUMN     "parameterId" TEXT,
ALTER COLUMN "itemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "PhaseParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
