-- S88 Batch Record System - Phase 1: Foundation
-- ISA-S88 compliant batch record tracking with event logging

-- CreateEnum: Batch Record Status (S88 lifecycle states)
CREATE TYPE "EnumBatchRecordStatus" AS ENUM ('Created', 'Active', 'Paused', 'Completed', 'PendingReview', 'Approved', 'Rejected', 'Cancelled');

-- CreateEnum: Production Event Types
CREATE TYPE "EnumProductionEventType" AS ENUM (
    'PhaseStarted', 'PhaseCompleted', 'PhasePaused', 'PhaseResumed', 'PhaseAborted',
    'StepStarted', 'StepCompleted', 'StepPaused', 'StepResumed', 'StepHeld', 'StepAborted',
    'BatchStatusChanged', 'StateTransition',
    'OperatorAction', 'ManualEntry', 'ParameterOverride', 'SetpointChange', 'ConditionOverride',
    'MaterialAdded', 'MaterialConsumed', 'LotAssigned',
    'EquipmentAllocated', 'EquipmentReleased', 'EquipmentStarted', 'EquipmentStopped', 'EquipmentFault', 'EquipmentModeChange',
    'SampleTaken', 'TestCompleted', 'DeviationDetected', 'DeviationAcknowledged', 'DeviationResolved',
    'AlarmRaised', 'AlarmAcknowledged', 'AlarmCleared',
    'SignOff', 'NoteAdded', 'AttachmentAdded'
);

-- CreateEnum: Production Event Categories
CREATE TYPE "EnumProductionEventCategory" AS ENUM (
    'StateChange', 'OperatorAction', 'MaterialTracking', 'EquipmentStatus',
    'QualityControl', 'Alarm', 'Administrative'
);

-- CreateEnum: Event Severity Levels
CREATE TYPE "EnumEventSeverity" AS ENUM ('Debug', 'Info', 'Warning', 'Error', 'Critical');

-- AlterTable: Add S88 batch record fields to Batch
ALTER TABLE "Batch" ADD COLUMN "batchRecordNumber" TEXT;
ALTER TABLE "Batch" ADD COLUMN "status" "EnumBatchRecordStatus" NOT NULL DEFAULT 'Created';
ALTER TABLE "Batch" ADD COLUMN "plannedStartTime" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "actualStartTime" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "plannedEndTime" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "actualEndTime" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "recipeName" TEXT;
ALTER TABLE "Batch" ADD COLUMN "recipeRevision" INTEGER;
ALTER TABLE "Batch" ADD COLUMN "totalProofGallons" DOUBLE PRECISION;
ALTER TABLE "Batch" ADD COLUMN "totalWineGallons" DOUBLE PRECISION;
ALTER TABLE "Batch" ADD COLUMN "totalBarrels" INTEGER;
ALTER TABLE "Batch" ADD COLUMN "preparedBy" TEXT;
ALTER TABLE "Batch" ADD COLUMN "preparedAt" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "Batch" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "Batch" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Batch" ADD COLUMN "currentStepExecutionId" TEXT;

-- CreateIndex: Unique constraint on batch record number
CREATE UNIQUE INDEX "Batch_batchRecordNumber_key" ON "Batch"("batchRecordNumber");

-- CreateTable: Production Event
CREATE TABLE "ProductionEvent" (
    "id" TEXT NOT NULL,
    "globalId" TEXT,
    "batchId" TEXT NOT NULL,
    "eventType" "EnumProductionEventType" NOT NULL,
    "eventCategory" "EnumProductionEventCategory" NOT NULL,
    "severity" "EnumEventSeverity" NOT NULL DEFAULT 'Info',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "phase" "EnumProductionPhase",
    "operationName" TEXT,
    "stepIndex" INTEGER,
    "branchIndex" INTEGER,
    "assetId" TEXT,
    "previousState" TEXT,
    "newState" TEXT,
    "parameterName" TEXT,
    "previousValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "units" TEXT,
    "conditionId" TEXT,
    "originalCondition" JSONB,
    "overrideValue" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "initiatedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "schemaVersion" TEXT,

    CONSTRAINT "ProductionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: globalId unique
CREATE UNIQUE INDEX "ProductionEvent_globalId_key" ON "ProductionEvent"("globalId");

-- CreateIndex: Performance indexes
CREATE INDEX "ProductionEvent_batchId_idx" ON "ProductionEvent"("batchId");
CREATE INDEX "ProductionEvent_eventType_idx" ON "ProductionEvent"("eventType");
CREATE INDEX "ProductionEvent_eventCategory_idx" ON "ProductionEvent"("eventCategory");
CREATE INDEX "ProductionEvent_occurredAt_idx" ON "ProductionEvent"("occurredAt");
CREATE INDEX "ProductionEvent_severity_idx" ON "ProductionEvent"("severity");

-- AddForeignKey: ProductionEvent -> Batch
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ProductionEvent -> Asset
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
