-- Create a temporary function to generate CUIDs for this migration
CREATE OR REPLACE FUNCTION generate_cuid()
RETURNS TEXT AS $$
BEGIN
    -- This is a simplified CUID generator for migration purposes.
    -- It generates a 'c' followed by 24 random hex characters.
    RETURN 'c' || substr(md5(random()::text) || md5(random()::text), 1, 24);
END;
$$ LANGUAGE plpgsql;

-- CreateTable
CREATE TABLE "WhiskeyType" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "globalId" TEXT,
    "isTTBDefinition" BOOLEAN NOT NULL DEFAULT false,
    "ttbWhiskeyTypeId" TEXT,

    CONSTRAINT "WhiskeyType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhiskeyType_code_key" ON "WhiskeyType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WhiskeyType_globalId_key" ON "WhiskeyType"("globalId");

-- AddColumn to Lot table for WhiskeyType reference
ALTER TABLE "Lot" ADD COLUMN "whiskeyTypeId" TEXT;

-- AddForeignKey for WhiskeyType self-referential relation
ALTER TABLE "WhiskeyType" ADD CONSTRAINT "WhiskeyType_ttbWhiskeyTypeId_fkey" FOREIGN KEY ("ttbWhiskeyTypeId") REFERENCES "WhiskeyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey for Lot to WhiskeyType relation
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_whiskeyTypeId_fkey" FOREIGN KEY ("whiskeyTypeId") REFERENCES "WhiskeyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex for Lot whiskeyTypeId
CREATE INDEX "Lot_whiskeyTypeId_idx" ON "Lot"("whiskeyTypeId");

-- Insert initial WhiskeyType data (TTB definitions first)
INSERT INTO "WhiskeyType" ("id", "createdAt", "updatedAt", "code", "name", "description", "category", "active", "globalId", "isTTBDefinition")
VALUES
  (generate_cuid(), NOW(), NOW(), 'ASM', 'American Single Malt', 'Single malt whiskey produced in the United States', 'Single Malt', true, generate_cuid(), true),
  (generate_cuid(), NOW(), NOW(), 'CW', 'Corn Whiskey', 'Whiskey made from at least 80% corn mash', 'Corn', true, generate_cuid(), true),
  (generate_cuid(), NOW(), NOW(), 'RW', 'Rye Whiskey', 'Whiskey made from at least 51% rye mash', 'Rye', true, generate_cuid(), true),
  (generate_cuid(), NOW(), NOW(), 'WW', 'Wheat Whiskey', 'Whiskey made from at least 51% wheat mash', 'Wheat', true, generate_cuid(), true),
  (generate_cuid(), NOW(), NOW(), 'MW', 'Malt Whiskey', 'Whiskey made primarily from malted barley', 'Malt', true, generate_cuid(), true),
  (generate_cuid(), NOW(), NOW(), 'FGW', 'Four Grain Whiskey', 'Whiskey made with four grain varieties', 'Four Grain', true, generate_cuid(), true);

-- Insert Bourbon Whiskey as a TTB definition (parent for bourbon subcategories)
INSERT INTO "WhiskeyType" ("id", "createdAt", "updatedAt", "code", "name", "description", "category", "active", "globalId", "isTTBDefinition")
VALUES (
  generate_cuid(),
  NOW(),
  NOW(),
  'BW',
  'Bourbon Whiskey',
  'Whiskey produced in the United States at not exceeding 160° proof from a fermented mash of not less than 51 percent corn and stored at not more than 125° proof in charred new oak containers',
  'Bourbon',
  true,
  generate_cuid(),
  true
);

-- Get the ID of the Bourbon Whiskey type and insert derived types
DO $$
DECLARE
  bourbon_whiskey_id TEXT;
BEGIN
  -- Get the ID of the Bourbon Whiskey type
  SELECT id INTO bourbon_whiskey_id FROM "WhiskeyType" WHERE code = 'BW';

  -- Insert bourbon subcategories that reference Bourbon Whiskey as their TTB parent
  INSERT INTO "WhiskeyType" ("id", "createdAt", "updatedAt", "code", "name", "description", "category", "active", "globalId", "isTTBDefinition", "ttbWhiskeyTypeId")
  VALUES
    (generate_cuid(), NOW(), NOW(), 'CB', 'Corn Bourbon', 'Bourbon whiskey with at least 51% corn mash', 'Bourbon', true, generate_cuid(), false, bourbon_whiskey_id),
    (generate_cuid(), NOW(), NOW(), 'RB', 'Rye Bourbon', 'Bourbon whiskey with significant rye content', 'Bourbon', true, generate_cuid(), false, bourbon_whiskey_id),
    (generate_cuid(), NOW(), NOW(), 'WB', 'Wheated Bourbon', 'Bourbon whiskey with wheat as secondary grain', 'Bourbon', true, generate_cuid(), false, bourbon_whiskey_id),
    (generate_cuid(), NOW(), NOW(), 'TW', 'Tennessee Whiskey', 'Bourbon whiskey produced in Tennessee with additional charcoal filtering (Lincoln County Process)', 'Bourbon', true, generate_cuid(), false, bourbon_whiskey_id),
    (generate_cuid(), NOW(), NOW(), 'FGB', 'Four Grain Bourbon', 'Bourbon whiskey made with four grain varieties', 'Bourbon', true, generate_cuid(), false, bourbon_whiskey_id);
END $$;

-- Temporarily disable immutable lot trigger to allow migration updates
ALTER TABLE "Lot" DISABLE TRIGGER ALL;

-- Migrate existing Lot enum values to WhiskeyType references
DO $$
DECLARE
  lot_record RECORD;
  whiskey_type_id TEXT;
BEGIN
  FOR lot_record IN
    SELECT id, "whiskeyType" FROM "Lot" WHERE "whiskeyType" IS NOT NULL
  LOOP
    -- Map enum values to WhiskeyType codes
    CASE lot_record."whiskeyType"
      WHEN 'AmericanSingleMalt' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'ASM';
      WHEN 'CornBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'CB';
      WHEN 'CornWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'CW';
      WHEN 'RyeBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'RB';
      WHEN 'RyeWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'RW';
      WHEN 'WheatedBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'WB';
      WHEN 'WheatWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'WW';
      ELSE
        whiskey_type_id := NULL;
    END CASE;

    IF whiskey_type_id IS NOT NULL THEN
      UPDATE "Lot" SET "whiskeyTypeId" = whiskey_type_id WHERE id = lot_record.id;
    END IF;
  END LOOP;
END $$;

-- Re-enable triggers on Lot table after migration
ALTER TABLE "Lot" ENABLE TRIGGER ALL;

-- AddColumn to Recipe table for WhiskeyType reference
ALTER TABLE "Recipe" ADD COLUMN "whiskeyTypeId" TEXT;

-- AddForeignKey for Recipe to WhiskeyType relation
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_whiskeyTypeId_fkey" FOREIGN KEY ("whiskeyTypeId") REFERENCES "WhiskeyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex for Recipe whiskeyTypeId
CREATE INDEX "Recipe_whiskeyTypeId_idx" ON "Recipe"("whiskeyTypeId");

-- Migrate existing Recipe enum values to WhiskeyType references
DO $$
DECLARE
  recipe_record RECORD;
  whiskey_type_id TEXT;
BEGIN
  FOR recipe_record IN
    SELECT id, "whiskeyType" FROM "Recipe" WHERE "whiskeyType" IS NOT NULL
  LOOP
    -- Map enum values to WhiskeyType codes
    CASE recipe_record."whiskeyType"
      WHEN 'RyeBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'RB';
      WHEN 'WheatedBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'WB';
      WHEN 'FourGrainBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'FGB';
      WHEN 'RyeWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'RW';
      WHEN 'WheatWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'WW';
      WHEN 'MaltWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'MW';
      WHEN 'FourGrainWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'FGW';
      ELSE
        whiskey_type_id := NULL;
    END CASE;

    IF whiskey_type_id IS NOT NULL THEN
      UPDATE "Recipe" SET "whiskeyTypeId" = whiskey_type_id WHERE id = recipe_record.id;
    END IF;
  END LOOP;
END $$;

-- Create sync trigger for Lot (keep legacy enum and new FK consistent)
CREATE OR REPLACE FUNCTION lot_whiskeytype_sync() RETURNS trigger AS $sync$
DECLARE
  _code TEXT;
BEGIN
  -- If ID is provided, derive enum
  IF NEW."whiskeyTypeId" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."whiskeyTypeId" IS NULL OR NEW."whiskeyTypeId" != OLD."whiskeyTypeId") THEN
    SELECT code INTO _code FROM "WhiskeyType" WHERE id = NEW."whiskeyTypeId";
    NEW."whiskeyType" :=
      CASE _code
        WHEN 'ASM' THEN 'AmericanSingleMalt'::"EnumLotWhiskeyType"
        WHEN 'CB'  THEN 'CornBourbon'::"EnumLotWhiskeyType"
        WHEN 'CW'  THEN 'CornWhiskey'::"EnumLotWhiskeyType"
        WHEN 'RB'  THEN 'RyeBourbon'::"EnumLotWhiskeyType"
        WHEN 'RW'  THEN 'RyeWhiskey'::"EnumLotWhiskeyType"
        WHEN 'WB'  THEN 'WheatedBourbon'::"EnumLotWhiskeyType"
        WHEN 'WW'  THEN 'WheatWhiskey'::"EnumLotWhiskeyType"
        ELSE NEW."whiskeyType"
      END;
  ELSIF NEW."whiskeyType" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."whiskeyType" IS NULL OR NEW."whiskeyType" != OLD."whiskeyType") THEN
    -- If legacy enum is provided, derive ID
    SELECT id INTO NEW."whiskeyTypeId"
    FROM "WhiskeyType"
    WHERE code = CASE NEW."whiskeyType"
      WHEN 'AmericanSingleMalt' THEN 'ASM'
      WHEN 'CornBourbon'       THEN 'CB'
      WHEN 'CornWhiskey'       THEN 'CW'
      WHEN 'RyeBourbon'        THEN 'RB'
      WHEN 'RyeWhiskey'        THEN 'RW'
      WHEN 'WheatedBourbon'    THEN 'WB'
      WHEN 'WheatWhiskey'      THEN 'WW'
      ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$sync$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lot_whiskeytype_sync_trg ON "Lot";
CREATE TRIGGER lot_whiskeytype_sync_trg
BEFORE INSERT OR UPDATE ON "Lot"
FOR EACH ROW EXECUTE FUNCTION lot_whiskeytype_sync();

-- Create sync trigger for Recipe (keep legacy enum and new FK consistent)
CREATE OR REPLACE FUNCTION recipe_whiskeytype_sync() RETURNS trigger AS $sync$
DECLARE
  _code TEXT;
BEGIN
  -- If ID is provided, derive enum
  IF NEW."whiskeyTypeId" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."whiskeyTypeId" IS NULL OR NEW."whiskeyTypeId" != OLD."whiskeyTypeId") THEN
    SELECT code INTO _code FROM "WhiskeyType" WHERE id = NEW."whiskeyTypeId";
    NEW."whiskeyType" :=
      CASE _code
        WHEN 'RB'  THEN 'RyeBourbon'::"EnumRecipeWhiskeyType"
        WHEN 'WB'  THEN 'WheatedBourbon'::"EnumRecipeWhiskeyType"
        WHEN 'FGB' THEN 'FourGrainBourbon'::"EnumRecipeWhiskeyType"
        WHEN 'RW'  THEN 'RyeWhiskey'::"EnumRecipeWhiskeyType"
        WHEN 'WW'  THEN 'WheatWhiskey'::"EnumRecipeWhiskeyType"
        WHEN 'MW'  THEN 'MaltWhiskey'::"EnumRecipeWhiskeyType"
        WHEN 'FGW' THEN 'FourGrainWhiskey'::"EnumRecipeWhiskeyType"
        ELSE NEW."whiskeyType"
      END;
  ELSIF NEW."whiskeyType" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."whiskeyType" IS NULL OR NEW."whiskeyType" != OLD."whiskeyType") THEN
    -- If legacy enum is provided, derive ID
    SELECT id INTO NEW."whiskeyTypeId"
    FROM "WhiskeyType"
    WHERE code = CASE NEW."whiskeyType"
      WHEN 'RyeBourbon'        THEN 'RB'
      WHEN 'WheatedBourbon'    THEN 'WB'
      WHEN 'FourGrainBourbon'  THEN 'FGB'
      WHEN 'RyeWhiskey'        THEN 'RW'
      WHEN 'WheatWhiskey'      THEN 'WW'
      WHEN 'MaltWhiskey'       THEN 'MW'
      WHEN 'FourGrainWhiskey'  THEN 'FGW'
      ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$sync$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recipe_whiskeytype_sync_trg ON "Recipe";
CREATE TRIGGER recipe_whiskeytype_sync_trg
BEFORE INSERT OR UPDATE ON "Recipe"
FOR EACH ROW EXECUTE FUNCTION recipe_whiskeytype_sync();

-- Drop the temporary CUID generator function
DROP FUNCTION IF EXISTS generate_cuid();

-- After migration, drop the old enum columns (commented out for safety - run manually after verification)
-- When ready to remove backward compatibility, also drop the triggers:
-- DROP TRIGGER IF EXISTS lot_whiskeytype_sync_trg ON "Lot";
-- DROP TRIGGER IF EXISTS recipe_whiskeytype_sync_trg ON "Recipe";
-- DROP FUNCTION IF EXISTS lot_whiskeytype_sync();
-- DROP FUNCTION IF EXISTS recipe_whiskeytype_sync();
-- ALTER TABLE "Lot" DROP COLUMN "whiskeyType";
-- ALTER TABLE "Recipe" DROP COLUMN "whiskeyType";
-- DROP TYPE IF EXISTS "EnumLotWhiskeyType";
-- DROP TYPE IF EXISTS "EnumRecipeWhiskeyType";
