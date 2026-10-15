/*
  Warnings:

  - The values [Created,PendingBarrelCount] on the enum `EnumLotStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EnumLotStatus_new" AS ENUM ('Started', 'PendingValidation', 'Submitted', 'Complete');

ALTER TABLE "Lot" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "Lot" SET "status" = 'Started' WHERE "status" = 'Created';
UPDATE "Lot" SET "status" = 'PendingValidation' WHERE "status" = 'PendingBarrelCount';
ALTER TABLE "Lot" ALTER COLUMN "status" TYPE "EnumLotStatus_new" USING ("status"::text::"EnumLotStatus_new");
ALTER TYPE "EnumLotStatus" RENAME TO "EnumLotStatus_old";
ALTER TYPE "EnumLotStatus_new" RENAME TO "EnumLotStatus";
DROP TYPE "EnumLotStatus_old";
ALTER TABLE "Lot" ALTER COLUMN "status" SET DEFAULT 'Started';
COMMIT;

-- AlterTable
ALTER TABLE "Lot" ALTER COLUMN "status" SET DEFAULT 'Started';
