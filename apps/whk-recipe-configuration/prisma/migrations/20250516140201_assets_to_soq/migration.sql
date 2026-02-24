/*
  Warnings:

  - You are about to drop the column `nextOperation` on the `ScheduleOrderQueue` table. All the data in the column will be lost.
  - You are about to drop the column `nextUnitProcedureId` on the `ScheduleOrderQueue` table. All the data in the column will be lost.
  - You are about to drop the column `nextUnitProcedureName` on the `ScheduleOrderQueue` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ScheduleOrderQueue" DROP CONSTRAINT "ScheduleOrderQueue_nextUnitProcedureId_fkey";

-- DropIndex
DROP INDEX "ScheduleOrderQueue_queueIndex_nextUnitProcedureId_key";

-- AlterTable
ALTER TABLE "ScheduleOrderQueue" DROP COLUMN "nextOperation",
DROP COLUMN "nextUnitProcedureId",
DROP COLUMN "nextUnitProcedureName";

-- DropEnum
DROP TYPE "EnumScheduleOrderQueueNextOperation";

-- CreateTable
CREATE TABLE "_AssetToScheduleOrderQueue" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AssetToScheduleOrderQueue_AB_unique" ON "_AssetToScheduleOrderQueue"("A", "B");

-- CreateIndex
CREATE INDEX "_AssetToScheduleOrderQueue_B_index" ON "_AssetToScheduleOrderQueue"("B");

-- AddForeignKey
ALTER TABLE "_AssetToScheduleOrderQueue" ADD CONSTRAINT "_AssetToScheduleOrderQueue_A_fkey" FOREIGN KEY ("A") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssetToScheduleOrderQueue" ADD CONSTRAINT "_AssetToScheduleOrderQueue_B_fkey" FOREIGN KEY ("B") REFERENCES "ScheduleOrderQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
