/*
  Warnings:

  - You are about to alter the column `quantity` on the `BomItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `quantityActual` on the `BomItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `temperature` on the `FermentationDayDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `balling` on the `FermentationDayDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `acid` on the `FermentationDayDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `pH` on the `FermentationDayDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `dryInches` on the `FermentationDayDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `temperature` on the `FermentationSettingDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `dryInches` on the `FermentationSettingDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `balling` on the `FermentationSettingDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `acid` on the `FermentationSettingDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `pH` on the `FermentationSettingDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `proof` on the `Inventory` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `quantity` on the `InventoryLog` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `quantity` on the `ItemReceipt` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `weighIn` on the `ItemReceipt` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `weighOut` on the `ItemReceipt` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `balling` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `pH` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `backSetPH` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `backsetVolume` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `waterVolume` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `cornLbs` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `ryeLbs` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `maltLbs` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `wheatLbs` on the `MashDatum` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `recipeNumericalSetpoint` on the `RecipeParameter` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `duration` on the `ScheduleOrder` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `testResult` on the `TestParameter` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `conversionRate` on the `UnitLookup` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.

*/
-- AlterTable
ALTER TABLE "BomItem" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "quantityActual" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "FermentationDayDatum" ALTER COLUMN "temperature" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "balling" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "acid" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pH" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "dryInches" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "FermentationSettingDatum" ALTER COLUMN "temperature" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "dryInches" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "balling" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "acid" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pH" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Inventory" ALTER COLUMN "proof" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "InventoryLog" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ItemReceipt" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "weighIn" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "weighOut" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MashDatum" ALTER COLUMN "balling" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pH" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "backSetPH" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "backsetVolume" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "waterVolume" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "cornLbs" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "ryeLbs" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "maltLbs" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "wheatLbs" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RecipeParameter" ALTER COLUMN "recipeNumericalSetpoint" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ScheduleOrder" ALTER COLUMN "duration" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TestParameter" ALTER COLUMN "testResult" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "UnitLookup" ALTER COLUMN "conversionRate" SET DATA TYPE DOUBLE PRECISION;
