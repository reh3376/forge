-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "active" BOOLEAN DEFAULT true,
ADD COLUMN     "currentQuantity" INTEGER,
ADD COLUMN     "originalQuantity" INTEGER,
ALTER COLUMN "schemaVersion" DROP DEFAULT;
