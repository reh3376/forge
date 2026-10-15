-- CreateIndex
CREATE INDEX "enzyme_calculation_rules_enzymeConfigurationId_active_idx" ON "enzyme_calculation_rules"("enzymeConfigurationId", "active");

-- CreateIndex
CREATE INDEX "enzyme_calculation_rules_grainType_calculationMethod_idx" ON "enzyme_calculation_rules"("grainType", "calculationMethod");

-- CreateIndex
CREATE INDEX "enzyme_configurations_category_active_idx" ON "enzyme_configurations"("category", "active");

-- CreateIndex
CREATE INDEX "enzyme_configurations_active_createdAt_idx" ON "enzyme_configurations"("active", "createdAt");

-- CreateIndex
CREATE INDEX "system_configurations_active_dataType_idx" ON "system_configurations"("active", "dataType");
