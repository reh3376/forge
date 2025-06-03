-- AlterEnum
BEGIN;
CREATE TYPE "EnumLotStatus_new" AS ENUM ('Started', 'PendingValidation', 'Verified', 'Complete');
ALTER TABLE "Lot" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "Lot" SET "status" = 'Verified' WHERE "status" = 'Submitted';
ALTER TABLE "Lot" ALTER COLUMN "status" TYPE "EnumLotStatus_new" USING ("status"::text::"EnumLotStatus_new");
ALTER TYPE "EnumLotStatus" RENAME TO "EnumLotStatus_old";
ALTER TYPE "EnumLotStatus_new" RENAME TO "EnumLotStatus";
DROP TYPE "EnumLotStatus_old";
ALTER TABLE "Lot" ALTER COLUMN "status" SET DEFAULT 'Started';
COMMIT;

