-- S88 Batch Record System - StepExecution table + schema sync
-- Creates StepExecution table and links MashingProtocolStepActual

-- ============================================
-- S88 STEP STATE ENUM (idempotent - skip if exists)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EnumS88StepState') THEN
        CREATE TYPE "EnumS88StepState" AS ENUM (
            'Idle',
            'Running',
            'Complete',
            'Paused',
            'Held',
            'Stopping',
            'Stopped',
            'Aborting',
            'Aborted',
            'Restarting'
        );
    END IF;
END $$;

-- ============================================
-- STEP EXECUTION TABLE (idempotent - skip if exists)
-- ============================================
CREATE TABLE IF NOT EXISTS "StepExecution" (
    "id" TEXT NOT NULL,
    "globalId" TEXT,
    "batchId" TEXT NOT NULL,
    "mashingProtocolStepId" TEXT,
    "phaseProtocolStepId" TEXT,
    "phase" "EnumProductionPhase" NOT NULL,
    "operationName" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "branchIndex" INTEGER NOT NULL DEFAULT 0,
    "stepName" TEXT NOT NULL,
    "state" "EnumS88StepState" NOT NULL DEFAULT 'Idle',
    "previousState" "EnumS88StepState",
    "allocatedAssetId" TEXT,
    "equipmentMode" TEXT,
    "plannedStartTime" TIMESTAMP(3),
    "plannedEndTime" TIMESTAMP(3),
    "plannedDuration" INTEGER,
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "actualDuration" INTEGER,
    "entryConditionMet" BOOLEAN NOT NULL DEFAULT false,
    "entryConditionMetAt" TIMESTAMP(3),
    "exitConditionMet" BOOLEAN NOT NULL DEFAULT false,
    "exitConditionMetAt" TIMESTAMP(3),
    "conditionOverrides" JSONB,
    "startedBy" TEXT,
    "completedBy" TEXT,
    "pausedBy" TEXT,
    "pauseReason" TEXT,
    "heldBy" TEXT,
    "holdReason" TEXT,
    "abortedBy" TEXT,
    "abortReason" TEXT,
    "stateHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schemaVersion" TEXT,

    CONSTRAINT "StepExecution_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES (idempotent - skip if exists)
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS "StepExecution_globalId_key" ON "StepExecution"("globalId");
CREATE INDEX IF NOT EXISTS "StepExecution_batchId_idx" ON "StepExecution"("batchId");
CREATE INDEX IF NOT EXISTS "StepExecution_state_idx" ON "StepExecution"("state");
CREATE INDEX IF NOT EXISTS "StepExecution_phase_stepIndex_idx" ON "StepExecution"("phase", "stepIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "StepExecution_batchId_phase_branchIndex_stepIndex_key" ON "StepExecution"("batchId", "phase", "branchIndex", "stepIndex");

-- ============================================
-- FOREIGN KEYS (idempotent - skip if exists)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'StepExecution_batchId_fkey') THEN
        ALTER TABLE "StepExecution" ADD CONSTRAINT "StepExecution_batchId_fkey"
            FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'StepExecution_allocatedAssetId_fkey') THEN
        ALTER TABLE "StepExecution" ADD CONSTRAINT "StepExecution_allocatedAssetId_fkey"
            FOREIGN KEY ("allocatedAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ============================================
-- MASHING PROTOCOL STEP ACTUAL: Link to StepExecution (idempotent)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MashingProtocolStepActual' AND column_name = 'stepExecutionId') THEN
        ALTER TABLE "MashingProtocolStepActual" ADD COLUMN "stepExecutionId" TEXT;
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "MashingProtocolStepActual_stepExecutionId_key" ON "MashingProtocolStepActual"("stepExecutionId");
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MashingProtocolStepActual_stepExecutionId_fkey') THEN
        ALTER TABLE "MashingProtocolStepActual" ADD CONSTRAINT "MashingProtocolStepActual_stepExecutionId_fkey"
            FOREIGN KEY ("stepExecutionId") REFERENCES "StepExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
