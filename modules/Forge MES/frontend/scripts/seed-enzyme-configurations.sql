-- Enzyme Configuration and Calculation Rules Seeding Script
-- This script creates enzyme configurations and calculation rules for all enzyme items

-- First, let's create enzyme configurations for all enzyme items
-- Using typical dosing rates for distillery enzymes (lbs per metric ton)

INSERT INTO enzyme_configurations (
    id,
    "itemId",
    category,
    "dosePerMetricTon",
    instructions,
    active,
    "createdAt",
    "createdBy",
    "updatedAt"
) VALUES
-- Laminex C2K - Viscosity reducing enzyme
('ec_laminex_c2k', 'clyd1ofoq001xfd45678b666b', 'VISCOSITY', 0.1, 'at 152 degrees F on crash', true, NOW(), 'system_seed', NOW()),

-- DIAZYME SSF2 - Alpha-amylase for liquefaction
('ec_diazyme_ssf2', 'clzhhlsx30f09mbc9r5mj02z7', 'LIQUEFACTION', 0.15, 'at 180-190 degrees F during cooking', true, NOW(), 'system_seed', NOW()),

-- Termamyl - Alpha-amylase for liquefaction
('ec_termamyl', 'clzelxl5v005osuwb3rfax6ix', 'LIQUEFACTION', 0.12, 'at 180-190 degrees F during cooking', true, NOW(), 'system_seed', NOW()),

-- Termamyl SC DC - Alpha-amylase for liquefaction
('ec_termamyl_sc_dc', 'clyd1ofor001zfd45hc2pewnd', 'LIQUEFACTION', 0.12, 'at 180-190 degrees F during cooking', true, NOW(), 'system_seed', NOW()),

-- Saczyme - Glucoamylase for saccharification
('ec_saczyme', 'clyd1ofot0022fd45d8j321v4', 'SACCHARIFICATION', 0.2, 'at 140-150 degrees F during saccharification', true, NOW(), 'system_seed', NOW()),

-- Viscoferm - Viscosity reducing enzyme
('ec_viscoferm', 'clyd1ofou0024fd45e71gyxcu', 'VISCOSITY', 0.08, 'at 152 degrees F on crash', true, NOW(), 'system_seed', NOW()),

-- Liquozyme Pro - Viscosity reducing enzyme
('ec_liquozyme_pro', 'clzhhlwfj0f8ysuwb7whvgy9s', 'VISCOSITY', 0.1, 'at 152 degrees F on crash', true, NOW(), 'system_seed', NOW())

ON CONFLICT (id) DO UPDATE SET
    "dosePerMetricTon" = EXCLUDED."dosePerMetricTon",
    instructions = EXCLUDED.instructions,
    "updatedAt" = NOW();

-- Now create calculation rules for each enzyme configuration
-- Using TOTAL_GRAIN method with multiplier 1.0 for standard dosing

INSERT INTO enzyme_calculation_rules (
    id,
    "enzymeConfigurationId",
    "grainType",
    "calculationMethod",
    multiplier,
    active,
    "createdAt",
    "createdBy",
    "updatedAt"
) VALUES
('ecr_laminex_c2k', 'ec_laminex_c2k', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW()),
('ecr_diazyme_ssf2', 'ec_diazyme_ssf2', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW()),
('ecr_termamyl', 'ec_termamyl', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW()),
('ecr_termamyl_sc_dc', 'ec_termamyl_sc_dc', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW()),
('ecr_saczyme', 'ec_saczyme', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW()),
('ecr_viscoferm', 'ec_viscoferm', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW()),
('ecr_liquozyme_pro', 'ec_liquozyme_pro', NULL, 'TOTAL_GRAIN', 1.0, true, NOW(), 'system_seed', NOW())

ON CONFLICT (id) DO UPDATE SET
    multiplier = EXCLUDED.multiplier,
    "updatedAt" = NOW();

-- Verify the seeding
SELECT 
    ec.id as config_id,
    i."itemName",
    ec.category,
    ec."dosePerMetricTon",
    ec.instructions,
    ecr.id as rule_id,
    ecr."calculationMethod"
FROM enzyme_configurations ec
JOIN "Item" i ON ec."itemId" = i.id
LEFT JOIN enzyme_calculation_rules ecr ON ecr."enzymeConfigurationId" = ec.id
ORDER BY i."itemName"; 