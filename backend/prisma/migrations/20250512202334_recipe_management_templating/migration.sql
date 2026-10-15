-- CreateEnum
CREATE TYPE "EnumMashingProtocolTemplateCategory" AS ENUM ('StraightBourbon', 'HighRye', 'FourGrain');

-- AlterTable
ALTER TABLE "MashingProtocol" ADD COLUMN     "isTemplate" BOOLEAN DEFAULT false,
ADD COLUMN     "templateCategory" "EnumMashingProtocolTemplateCategory",
ADD COLUMN     "templateDescription" TEXT;
