/*
  Warnings:

  - The values [Created,PendingBarrelCount] on the enum `EnumLotStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `assetPath` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `batchInitData` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `customers` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `mashingProtocolId` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `operationIndex` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `operationType` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `parameterData` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `productionOrderId` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `recipeName` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `batchId` on the `FermentationChemistry` table. All the data in the column will be lost.
  - You are about to drop the column `batchId` on the `RecipeBomItem` table. All the data in the column will be lost.
  - You are about to drop the column `classIdid` on the `RecipeBomItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[activeInstanceId]` on the table `RecipeBomItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EnumLotStatus_new" AS ENUM ('Started', 'PendingValidation', 'Submitted', 'Complete');
ALTER TABLE "Lot" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lot" ALTER COLUMN "status" TYPE "EnumLotStatus_new" USING ("status"::text::"EnumLotStatus_new");
ALTER TYPE "EnumLotStatus" RENAME TO "EnumLotStatus_old";
ALTER TYPE "EnumLotStatus_new" RENAME TO "EnumLotStatus";
DROP TYPE "EnumLotStatus_old";
ALTER TABLE "Lot" ALTER COLUMN "status" SET DEFAULT 'Started';
COMMIT;

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_mashingProtocolId_fkey";

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_productionOrderId_fkey";

-- DropForeignKey
ALTER TABLE "FermentationChemistry" DROP CONSTRAINT "FermentationChemistry_batchId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeBomItem" DROP CONSTRAINT "RecipeBomItem_batchId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeBomItem" DROP CONSTRAINT "RecipeBomItem_classIdid_fkey";

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "assetPath",
DROP COLUMN "batchInitData",
DROP COLUMN "customers",
DROP COLUMN "mashingProtocolId",
DROP COLUMN "operationIndex",
DROP COLUMN "operationType",
DROP COLUMN "parameterData",
DROP COLUMN "productionOrderId",
DROP COLUMN "recipeName";

-- AlterTable
ALTER TABLE "FermentationChemistry" DROP COLUMN "batchId";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "baseBomItem" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "furnishingCustomerId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'Started';

-- AlterTable
ALTER TABLE "RecipeBomItem" DROP COLUMN "batchId",
DROP COLUMN "classIdid",
ADD COLUMN     "activeInstanceId" TEXT;

-- DropEnum
DROP TYPE "EnumBatchOperationType";

-- CreateTable
CREATE TABLE "MashingProtocolStepActual" (
    "actualValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "mashingProtocolStepId" TEXT NOT NULL,
    "stepCompletedAt" TIMESTAMP(3),
    "timeActualValue" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "MashingProtocolStepActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeBomActual" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "mashingProtocolStepActualId" TEXT,
    "recipeBomId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "value" DOUBLE PRECISION,

    CONSTRAINT "RecipeBomActual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeBomItem_activeInstanceId_key" ON "RecipeBomItem"("activeInstanceId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_furnishingCustomerId_fkey" FOREIGN KEY ("furnishingCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBomItem" ADD CONSTRAINT "RecipeBomItem_activeInstanceId_fkey" FOREIGN KEY ("activeInstanceId") REFERENCES "RecipeBomItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MashingProtocolStepActual" ADD CONSTRAINT "MashingProtocolStepActual_mashingProtocolStepId_fkey" FOREIGN KEY ("mashingProtocolStepId") REFERENCES "MashingProtocolStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBomActual" ADD CONSTRAINT "RecipeBomActual_mashingProtocolStepActualId_fkey" FOREIGN KEY ("mashingProtocolStepActualId") REFERENCES "MashingProtocolStepActual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBomActual" ADD CONSTRAINT "RecipeBomActual_recipeBomId_fkey" FOREIGN KEY ("recipeBomId") REFERENCES "RecipeBom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
