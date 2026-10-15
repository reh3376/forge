/*
  Warnings:

  - You are about to drop the column `units` on the `RecipeBomItem` table. All the data in the column will be lost.
  - You are about to drop the `Unit` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "unitsId" TEXT;

-- AlterTable
ALTER TABLE "RecipeBomItem" DROP COLUMN "units",
ADD COLUMN     "displayUnitsId" TEXT;

-- AlterTable
ALTER TABLE "Units" ADD COLUMN     "itemGroupId" TEXT,
ADD COLUMN     "mesConfiguredUnit" BOOLEAN DEFAULT false;

-- DropTable
DROP TABLE "Unit";

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unitsId_fkey" FOREIGN KEY ("unitsId") REFERENCES "Units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBomItem" ADD CONSTRAINT "RecipeBomItem_displayUnitsId_fkey" FOREIGN KEY ("displayUnitsId") REFERENCES "Units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Units" ADD CONSTRAINT "Units_itemGroupId_fkey" FOREIGN KEY ("itemGroupId") REFERENCES "ItemGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
