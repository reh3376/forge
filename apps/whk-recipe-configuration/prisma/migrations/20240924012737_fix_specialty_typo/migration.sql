/*
  Warnings:

  - The values [Speciality] on the enum `EnumEquipmentPhaseStepType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EnumEquipmentPhaseStepType_new" AS ENUM ('Water', 'Backset', 'Corn', 'Rye', 'Wheat', 'Malt', 'Premalt', 'Specialty', 'Enzyme', 'Nutrient', 'Yeast', 'Citric', 'Hold', 'Cool', 'NotRequired', 'Heat', 'Vessel', 'Pipe');
ALTER TABLE "EquipmentPhase" ALTER COLUMN "stepType" DROP DEFAULT;
ALTER TABLE "EquipmentPhase" ALTER COLUMN "stepType" TYPE "EnumEquipmentPhaseStepType_new" USING ("stepType"::text::"EnumEquipmentPhaseStepType_new");
ALTER TYPE "EnumEquipmentPhaseStepType" RENAME TO "EnumEquipmentPhaseStepType_old";
ALTER TYPE "EnumEquipmentPhaseStepType_new" RENAME TO "EnumEquipmentPhaseStepType";
DROP TYPE "EnumEquipmentPhaseStepType_old";
ALTER TABLE "EquipmentPhase" ALTER COLUMN "stepType" SET DEFAULT 'NotRequired';
COMMIT;
