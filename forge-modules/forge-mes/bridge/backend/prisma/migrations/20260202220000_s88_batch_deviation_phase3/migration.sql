-- S88 Batch Record System - Phase 3: Deviation Tracking
-- Migration: Add BatchDeviation model with enums

-- ============================================
-- DEVIATION TYPE ENUM
-- ============================================
CREATE TYPE "EnumDeviationType" AS ENUM (
    'ParameterOutOfSpec',
    'TimingDeviation',
    'MaterialDeviation',
    'ProcessDeviation',
    'EquipmentFailure',
    'OperatorError',
    'QualityFailure',
    'EnvironmentalDeviation',
    'Other'
);

-- ============================================
-- DEVIATION SEVERITY ENUM
-- ============================================
CREATE TYPE "EnumDeviationSeverity" AS ENUM (
    'Minor',
    'Major',
    'Critical'
);

-- ============================================
-- DEVIATION STATUS ENUM
-- ============================================
CREATE TYPE "EnumDeviationStatus" AS ENUM (
    'Open',
    'UnderInvestigation',
    'PendingCorrectiveAction',
    'Resolved',
    'Closed'
);

-- ============================================
-- BATCH DEVIATION TABLE
-- ============================================
CREATE TABLE "BatchDeviation" (
    "id" TEXT NOT NULL,
    "globalId" TEXT,
    "batchId" TEXT NOT NULL,
    "deviationType" "EnumDeviationType" NOT NULL,
    "severity" "EnumDeviationSeverity" NOT NULL DEFAULT 'Minor',
    "isAutoDetected" BOOLEAN NOT NULL DEFAULT false,
    "parameterName" TEXT,
    "plannedValue" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION,
    "deviationPercent" DOUBLE PRECISION,
    "units" TEXT,
    "upperLimit" DOUBLE PRECISION,
    "lowerLimit" DOUBLE PRECISION,
    "phase" "EnumProductionPhase",
    "stepIndex" INTEGER,
    "stepExecutionId" TEXT,
    "assetId" TEXT,
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "status" "EnumDeviationStatus" NOT NULL DEFAULT 'Open',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedBy" TEXT NOT NULL,
    "investigationStartedAt" TIMESTAMP(3),
    "investigationStartedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "triggerEventId" TEXT,
    "attachments" JSONB,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "schemaVersion" TEXT,

    CONSTRAINT "BatchDeviation_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================
CREATE UNIQUE INDEX "BatchDeviation_globalId_key" ON "BatchDeviation"("globalId");
CREATE INDEX "BatchDeviation_batchId_idx" ON "BatchDeviation"("batchId");
CREATE INDEX "BatchDeviation_status_idx" ON "BatchDeviation"("status");
CREATE INDEX "BatchDeviation_severity_idx" ON "BatchDeviation"("severity");
CREATE INDEX "BatchDeviation_deviationType_idx" ON "BatchDeviation"("deviationType");
CREATE INDEX "BatchDeviation_detectedAt_idx" ON "BatchDeviation"("detectedAt");

-- ============================================
-- FOREIGN KEYS
-- ============================================
ALTER TABLE "BatchDeviation" ADD CONSTRAINT "BatchDeviation_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
