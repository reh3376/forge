-- Fix Temperature Data Migration
-- This script fixes mashing protocol steps where Cool steps have their temperature
-- stored in heatTempSp instead of coolTempSp (which is incorrect)

-- First, let's see what data needs to be fixed
SELECT 
    'BEFORE FIX' as status,
    mps.id,
    mps."stepType",
    mps."holdType",
    mps."heatTempSp",
    mps."coolTempSp",
    mps."index",
    mp.name as protocol_name
FROM "MashingProtocolStep" mps
LEFT JOIN "MashingProtocol" mp ON mps."mashingProtocolId" = mp.id
WHERE mps."holdType" = 'Cool' 
  AND mps."heatTempSp" IS NOT NULL 
  AND mps."coolTempSp" IS NULL
ORDER BY mp.name, mps."index";

-- Fix the data: Move heatTempSp to coolTempSp for Cool steps
UPDATE "MashingProtocolStep" 
SET 
    "coolTempSp" = "heatTempSp",
    "heatTempSp" = NULL,
    "updatedAt" = NOW()
WHERE "holdType" = 'Cool' 
  AND "heatTempSp" IS NOT NULL 
  AND "coolTempSp" IS NULL;

-- Verify the fix
SELECT 
    'AFTER FIX' as status,
    mps.id,
    mps."stepType",
    mps."holdType",
    mps."heatTempSp",
    mps."coolTempSp",
    mps."index",
    mp.name as protocol_name
FROM "MashingProtocolStep" mps
LEFT JOIN "MashingProtocol" mp ON mps."mashingProtocolId" = mp.id
WHERE mps."holdType" = 'Cool' 
  AND mps."coolTempSp" IS NOT NULL
ORDER BY mp.name, mps."index";

-- Show summary of changes
SELECT 
    COUNT(*) as total_cool_steps_fixed
FROM "MashingProtocolStep" 
WHERE "holdType" = 'Cool' 
  AND "coolTempSp" IS NOT NULL 
  AND "heatTempSp" IS NULL; 