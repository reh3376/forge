-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "estimatedBarrelsPerFermenter" DOUBLE PRECISION,
ADD COLUMN     "estimatedPGsPerBbl" DOUBLE PRECISION,
ADD COLUMN     "estimatedPGsPerBushel" DOUBLE PRECISION;
