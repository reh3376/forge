/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `ProductionOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `ScheduleOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "operationIndex" TEXT,
ADD COLUMN     "operationType" TEXT;

-- AlterTable
ALTER TABLE "BomItem" ADD COLUMN     "classId" TEXT,
ADD COLUMN     "isClassDefinition" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "ScheduleOrder" ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "ProductionOrderBomItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrderBomItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_name_key" ON "ProductionOrder"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrder_name_key" ON "ScheduleOrder"("name");

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "BomItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
