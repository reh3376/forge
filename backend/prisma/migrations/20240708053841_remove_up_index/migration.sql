-- DropIndex
DROP INDEX "UnitProcedure_name_revision_active_key";

-- AlterTable
ALTER TABLE "ItemReceipt" ALTER COLUMN "loadId" DROP NOT NULL;
