/*
  Warnings:

  - You are about to drop the column `scheduleOrdersId` on the `Customer` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_scheduleOrdersId_fkey";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "scheduleOrdersId";

-- CreateTable
CREATE TABLE "_CustomerToScheduleOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CustomerToScheduleOrder_AB_unique" ON "_CustomerToScheduleOrder"("A", "B");

-- CreateIndex
CREATE INDEX "_CustomerToScheduleOrder_B_index" ON "_CustomerToScheduleOrder"("B");

-- AddForeignKey
ALTER TABLE "_CustomerToScheduleOrder" ADD CONSTRAINT "_CustomerToScheduleOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToScheduleOrder" ADD CONSTRAINT "_CustomerToScheduleOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "ScheduleOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
