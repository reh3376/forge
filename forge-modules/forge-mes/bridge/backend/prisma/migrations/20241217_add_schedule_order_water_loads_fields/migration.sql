-- AlterTable
ALTER TABLE "ScheduleOrder" ADD COLUMN IF NOT EXISTS "totalWaterVolume" DOUBLE PRECISION;
ALTER TABLE "ScheduleOrder" ADD COLUMN IF NOT EXISTS "loadsLastUpdatedAt" TIMESTAMP(3);
ALTER TABLE "ScheduleOrder" ADD COLUMN IF NOT EXISTS "loadsLastUpdatedBy" TEXT;
