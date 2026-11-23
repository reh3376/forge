import {
  EnumProductionEventType,
  EnumProductionEventCategory,
  EnumEventSeverity,
  EnumProductionPhase,
} from "@prisma/client";

export interface LogEventInput {
  batchId: string;
  eventType: EnumProductionEventType;
  eventCategory: EnumProductionEventCategory;
  severity?: EnumEventSeverity;
  title: string;
  description?: string;
  phase?: EnumProductionPhase;
  operationName?: string;
  stepIndex?: number;
  branchIndex?: number;
  assetId?: string;
  previousState?: string;
  newState?: string;
  parameterName?: string;
  previousValue?: number;
  newValue?: number;
  units?: string;
  conditionId?: string;
  originalCondition?: any;
  overrideValue?: any;
  initiatedBy?: string;
  metadata?: any;
}
