-- CreateEnum
CREATE TYPE "EnumLotStatus" AS ENUM ('Created', 'PendingBarrelCount', 'Complete');

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "filledFromId" TEXT,
ADD COLUMN     "filledFromString" TEXT,
ADD COLUMN     "finalVolume" DOUBLE PRECISION,
ADD COLUMN     "finalWeight" DOUBLE PRECISION,
ADD COLUMN     "initialVolume" DOUBLE PRECISION,
ADD COLUMN     "initialWeight" DOUBLE PRECISION,
ADD COLUMN     "lotCreatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "EnumLotStatus" DEFAULT 'Created';

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_filledFromId_fkey" FOREIGN KEY ("filledFromId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
