/*
  Warnings:

  - You are about to drop the column `estimatedAbv` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `targetProof` on the `Recipe` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "estimatedAbv",
DROP COLUMN "targetProof";
