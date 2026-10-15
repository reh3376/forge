/*
  Warnings:

  - A unique constraint covering the columns `[abbreviation]` on the table `Units` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `Units` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[pluralName]` on the table `Units` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Units" ADD COLUMN     "baseUnitId" TEXT,
ADD COLUMN     "isBaseUnit" BOOLEAN DEFAULT false,
ADD COLUMN     "pluralAbbreviation" TEXT,
ADD COLUMN     "pluralName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Units_abbreviation_key" ON "Units"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "Units_name_key" ON "Units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Units_pluralName_key" ON "Units"("pluralName");

-- AddForeignKey
ALTER TABLE "Units" ADD CONSTRAINT "Units_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "Units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
