-- AlterTable
ALTER TABLE "AdditiveActual" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "BomItem" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "InventoryLog" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "InventoryTransfer" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "ItemGroup" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "MashingProtocol" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "MashingProtocolStep" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "MashingProtocolStepActual" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "MessageQueue" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "ProductionOrderBomItem" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "ProductionOrderRecipeInstance" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "RecipeBom" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "RecipeBomActual" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "RecipeBomItem" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "ScheduleOrder" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "UnitLookup" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "UnsBrokerConfiguration" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "UnsConfiguration" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "schemaVersion" TEXT;
