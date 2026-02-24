-- Add revision tracking fields to RecipeBomActual for mid-process recalculations
-- When consumption has started (quantityActual > 0), recalculations create new revisions
-- instead of updating in place, maintaining full audit history

-- Add new columns for revision tracking
ALTER TABLE "RecipeBomActual" ADD COLUMN "calculationRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RecipeBomActual" ADD COLUMN "isCurrentCalculation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RecipeBomActual" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "RecipeBomActual" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "RecipeBomActual" ADD COLUMN "recalculatedBy" TEXT;

-- Add unique constraint for the self-referential relation
ALTER TABLE "RecipeBomActual" ADD CONSTRAINT "RecipeBomActual_supersededById_key" UNIQUE ("supersededById");

-- Add foreign key for the self-referential relation (supersededBy points to the newer record)
ALTER TABLE "RecipeBomActual" ADD CONSTRAINT "RecipeBomActual_supersededById_fkey"
    FOREIGN KEY ("supersededById") REFERENCES "RecipeBomActual"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for efficient queries on current calculations
CREATE INDEX "RecipeBomActual_scheduleOrderRecipeInstanceId_recipeBomItemId_isCurrentCalculation_idx"
    ON "RecipeBomActual"("scheduleOrderRecipeInstanceId", "recipeBomItemId", "isCurrentCalculation");
