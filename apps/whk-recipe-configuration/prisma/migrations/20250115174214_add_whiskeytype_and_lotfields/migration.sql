-- CreateEnum
CREATE TYPE "EnumRecipeWhiskeyType" AS ENUM ('RyeBourbon', 'WheatedBourbon', 'FourGrainBourbon', 'RyeWhiskey', 'WheatWhiskey', 'MaltWhiskey', 'FourGrainWhiskey');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "proofInitial" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "proofInitial" DOUBLE PRECISION,
ADD COLUMN     "proofingTankId" TEXT,
ADD COLUMN     "tankOfOriginId" TEXT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "whiskeyType" "EnumRecipeWhiskeyType" DEFAULT 'RyeBourbon';

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_proofingTankId_fkey" FOREIGN KEY ("proofingTankId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_tankOfOriginId_fkey" FOREIGN KEY ("tankOfOriginId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
