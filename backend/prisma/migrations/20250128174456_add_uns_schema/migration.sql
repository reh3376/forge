/*
  Warnings:

  - You are about to drop the column `customers` on the `ScheduleOrder` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedDistillationTime` on the `ScheduleOrder` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedFermentationTime` on the `ScheduleOrder` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedMashingTime` on the `ScheduleOrder` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedProcessing` on the `ScheduleOrder` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedTotalProductionTime` on the `ScheduleOrder` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "EnumUnsConfigurationEventType" AS ENUM ('Create', 'Read', 'Update', 'Delete');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "scheduleOrdersId" TEXT;

-- AlterTable
ALTER TABLE "ScheduleOrder" DROP COLUMN "customers",
DROP COLUMN "estimatedDistillationTime",
DROP COLUMN "estimatedFermentationTime",
DROP COLUMN "estimatedMashingTime",
DROP COLUMN "estimatedProcessing",
DROP COLUMN "estimatedTotalProductionTime",
ADD COLUMN     "estimatedBarrelingStartTime" TIMESTAMP(3),
ADD COLUMN     "estimatedDistillationDuration" DOUBLE PRECISION,
ADD COLUMN     "estimatedDistillationStartTime" TIMESTAMP(3),
ADD COLUMN     "estimatedFermentationDuration" DOUBLE PRECISION,
ADD COLUMN     "estimatedFermentationStartTime" TIMESTAMP(3),
ADD COLUMN     "estimatedMashingDuration" DOUBLE PRECISION,
ADD COLUMN     "estimatedMashingStartTime" TIMESTAMP(3),
ADD COLUMN     "estimatedProcessingStartTime" TIMESTAMP(3),
ADD COLUMN     "estimatedTotalProductionDuration" DOUBLE PRECISION,
ALTER COLUMN "totalProofGallons" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "UnsConfiguration" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "enabled" BOOLEAN DEFAULT true,
    "entityName" TEXT,
    "eventType" "EnumUnsConfigurationEventType"[],
    "filterCriteria" JSONB,
    "id" TEXT NOT NULL,
    "topic" TEXT,
    "transformationFunction" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "UnsConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnsBrokerConfiguration" (
    "baseTopicPath" TEXT DEFAULT '#',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "password" TEXT,
    "port" INTEGER DEFAULT 1883,
    "protocol" TEXT DEFAULT 'mqtt://',
    "subscriptions" JSONB,
    "tls" BOOLEAN DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "username" TEXT,
    "validateCertificate" BOOLEAN DEFAULT false,

    CONSTRAINT "UnsBrokerConfiguration_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_scheduleOrdersId_fkey" FOREIGN KEY ("scheduleOrdersId") REFERENCES "ScheduleOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
