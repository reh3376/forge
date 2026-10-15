import {
  EnumDeviationType,
  EnumDeviationSeverity,
  EnumProductionPhase,
} from "@prisma/client";

export interface RecordDeviationInput {
  batchId: string;
  deviationType: EnumDeviationType;
  severity?: EnumDeviationSeverity;
  parameterName?: string;
  plannedValue?: number;
  actualValue?: number;
  units?: string;
  upperLimit?: number;
  lowerLimit?: number;
  phase?: EnumProductionPhase;
  stepIndex?: number;
  stepExecutionId?: string;
  assetId?: string;
  isAutoDetected?: boolean;
  description: string;
  triggerEventId?: string;
}
