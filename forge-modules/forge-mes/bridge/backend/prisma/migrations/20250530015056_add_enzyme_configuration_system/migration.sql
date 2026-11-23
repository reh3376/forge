-- CreateEnum
CREATE TYPE "EnumEnzymeCategory" AS ENUM ('LIQUIFACTION', 'SACCHARIFICATION', 'VISCOSITY');

-- CreateEnum
CREATE TYPE "EnumGrainType" AS ENUM ('CORN', 'RYE', 'WHEAT', 'MALT');

-- CreateEnum
CREATE TYPE "EnumCalculationMethod" AS ENUM ('TOTAL_GRAIN', 'GRAIN_SPECIFIC', 'CUSTOM');

-- CreateTable
CREATE TABLE "enzyme_configurations" (
    "id" TEXT NOT NULL,
    "globalId" TEXT,
    "itemId" TEXT NOT NULL,
    "category" "EnumEnzymeCategory" NOT NULL,
    "dosePerMetricTon" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "schemaVersion" TEXT DEFAULT '0001-a',

    CONSTRAINT "enzyme_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enzyme_calculation_rules" (
    "id" TEXT NOT NULL,
    "globalId" TEXT,
    "enzymeConfigurationId" TEXT NOT NULL,
    "grainType" "EnumGrainType",
    "calculationMethod" "EnumCalculationMethod" NOT NULL DEFAULT 'TOTAL_GRAIN',
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "enzyme_calculation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configurations" (
    "id" TEXT NOT NULL,
    "globalId" TEXT,
    "configKey" TEXT NOT NULL,
    "configValue" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'string',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "schemaVersion" TEXT DEFAULT '0001-a',

    CONSTRAINT "system_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enzyme_configurations_globalId_key" ON "enzyme_configurations"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "enzyme_configurations_itemId_key" ON "enzyme_configurations"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "enzyme_calculation_rules_globalId_key" ON "enzyme_calculation_rules"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "system_configurations_globalId_key" ON "system_configurations"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "system_configurations_configKey_key" ON "system_configurations"("configKey");

-- AddForeignKey
ALTER TABLE "enzyme_configurations" ADD CONSTRAINT "enzyme_configurations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enzyme_calculation_rules" ADD CONSTRAINT "enzyme_calculation_rules_enzymeConfigurationId_fkey" FOREIGN KEY ("enzymeConfigurationId") REFERENCES "enzyme_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
