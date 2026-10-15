-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "executedCooks" INTEGER,
ADD COLUMN     "executedFermenters" INTEGER,
ADD COLUMN     "totalCooks" INTEGER,
ADD COLUMN     "totalFermenters" INTEGER;
