/*
  Warnings:

  - You are about to drop the column `children` on the `Asset` table. All the data in the column will be lost.
  - The `testResult` column on the `TestParameter` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[parentId]` on the table `Asset` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "children",
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "TestParameter" DROP COLUMN "testResult",
ADD COLUMN     "testResult" DECIMAL(65,30);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_parentId_key" ON "Asset"("parentId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
