-- AlterEnum
-- This migration adds 'Verified' to the EnumLotStatus enum and updates any 'Submitted' values to 'Verified'
BEGIN;

-- First, drop the triggers and function that might interfere with the enum change
DROP TRIGGER IF EXISTS prevent_update_on_complete_lot ON "Lot";
DROP TRIGGER IF EXISTS prevent_delete_on_complete_lot ON "Lot";
DROP FUNCTION IF EXISTS prevent_modification_complete_lots();

-- Create the new enum type with 'Verified' added
CREATE TYPE "EnumLotStatus_new" AS ENUM ('Started', 'PendingValidation', 'Verified', 'Complete');

-- Add a temporary column to track which records were 'Submitted'
ALTER TABLE "Lot" ADD COLUMN "temp_was_submitted" BOOLEAN DEFAULT FALSE;

-- Mark the records that are currently 'Submitted'
UPDATE "Lot" SET "temp_was_submitted" = TRUE WHERE "status" = 'Submitted';

-- Drop the default temporarily
ALTER TABLE "Lot" ALTER COLUMN "status" DROP DEFAULT;

-- Convert 'Submitted' to 'PendingValidation' temporarily so we can change the column type
UPDATE "Lot" SET "status" = 'PendingValidation' WHERE "status" = 'Submitted';

-- Now convert the column to the new type
ALTER TABLE "Lot" ALTER COLUMN "status" TYPE "EnumLotStatus_new" USING ("status"::text::"EnumLotStatus_new");

-- Now update the records that were originally 'Submitted' to 'Verified'
UPDATE "Lot" SET "status" = 'Verified' WHERE "temp_was_submitted" = TRUE;

-- Clean up the temporary column
ALTER TABLE "Lot" DROP COLUMN "temp_was_submitted";

-- Rename the old enum type
ALTER TYPE "EnumLotStatus" RENAME TO "EnumLotStatus_old";

-- Rename the new enum type to the original name
ALTER TYPE "EnumLotStatus_new" RENAME TO "EnumLotStatus";

-- Drop the old enum type
DROP TYPE "EnumLotStatus_old";

-- Restore the default value
ALTER TABLE "Lot" ALTER COLUMN "status" SET DEFAULT 'Started';

-- Recreate the function and triggers
CREATE OR REPLACE FUNCTION prevent_modification_complete_lots()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the status is 'Complete'
    IF OLD.status = 'Complete' THEN
        RAISE EXCEPTION 'Operation not allowed: Record is immutable.';
    END IF;

    -- Determine the operation type
    IF TG_OP = 'DELETE' THEN
        RETURN OLD; -- For DELETE operations
    ELSE
        RETURN NEW; -- For UPDATE operations
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate the triggers
CREATE TRIGGER prevent_update_on_complete_lot
    BEFORE UPDATE ON "Lot"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_modification_complete_lots();

CREATE TRIGGER prevent_delete_on_complete_lot
    BEFORE DELETE ON "Lot"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_modification_complete_lots();

COMMIT;

