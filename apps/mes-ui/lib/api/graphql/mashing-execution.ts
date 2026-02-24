import { gql } from "@apollo/client";

/**
 * GraphQL queries and mutations for S88 Mashing Execution tracking
 * Matches backend MashingExecutionResolver schema
 */

// ===== Type Definitions =====

export type S88StepState =
  | "Idle"
  | "Running"
  | "Complete"
  | "Paused"
  | "Held"
  | "Stopping"
  | "Stopped"
  | "Aborting"
  | "Aborted"
  | "Restarting";

export type DeviationSeverity = "Minor" | "Major" | "Critical";
export type DeviationStatus =
  | "Open"
  | "UnderInvestigation"
  | "PendingCorrectiveAction"
  | "Resolved"
  | "Closed";

export interface LinkedBomItem {
  id: string;
  itemId?: string;
  itemName?: string;
  quantityPlanned?: number;
  units?: string;
}

export interface MashingStepState {
  stepExecutionId: string;
  mashingProtocolStepId: string;
  stepName: string;
  stepIndex: number;
  stepType?: string;
  grainType?: string; // Derived grain type for GrainAdd steps
  displayName?: string; // Human-readable display name
  state: S88StepState;
  targetTemperature?: number;
  targetDuration?: number; // seconds
  actualStartTime?: string;
  elapsedSeconds?: number;
  linkedBomItems?: LinkedBomItem[];
}

export interface CompletedMashingStep {
  stepExecutionId: string;
  mashingProtocolStepId: string;
  stepName: string;
  stepIndex: number;
  actualTemperature?: number;
  actualDuration?: number; // seconds
  completedAt?: string;
}

export interface PendingMashingStep {
  id: string;
  index: number;
  stepType?: string;
  grainType?: string; // Derived grain type for GrainAdd steps
  displayName?: string; // Human-readable display name
  promptMessage?: string;
  temperatureSetpoint?: number;
  stepTime?: number; // minutes
  linkedBomItems?: LinkedBomItem[];
}

export interface MashingStateResponse {
  scheduleOrderId: string;
  batchId?: string;
  currentStep?: MashingStepState;
  completedSteps: CompletedMashingStep[];
  pendingSteps: PendingMashingStep[];
  overallProgress: number;
}

export interface StepExecutionOutput {
  id: string;
  batchId: string;
  phase: string;
  stepIndex: number;
  stepName: string;
  state: S88StepState;
  previousState?: S88StepState;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDuration?: number;
  startedBy?: string;
  completedBy?: string;
  createdAt: string;
}

export interface MashingStepActualOutput {
  id: string;
  actualValue: number;
  timeActualValue?: number;
  stepCompletedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface BatchDeviationOutput {
  id: string;
  batchId: string;
  deviationType: string;
  severity: DeviationSeverity;
  status: DeviationStatus;
  parameterName?: string;
  plannedValue?: number;
  actualValue?: number;
  deviationPercent?: number;
  units?: string;
  description: string;
  isAutoDetected: boolean;
  detectedAt: string;
  detectedBy: string;
}

export interface MashingStepCompletionResult {
  stepExecution: StepExecutionOutput;
  actual: MashingStepActualOutput;
  deviations: BatchDeviationOutput[];
}

export interface ParameterActualInput {
  parameterName: string;
  valuePlanned?: number;
  valueActual?: number;
  textValueActual?: string;
  booleanValueActual?: boolean;
  notes?: string;
}

export interface MaterialConsumptionInput {
  recipeBomItemId: string;
  quantityActual: number;
  lotNumber?: string;
  addRate?: number;
  addRateUnit?: string;
}

export interface MashingStepActualsInput {
  actualTemperature: number;
  actualDuration?: number;
  timeActualValue?: number;
  notes?: string;
  parameters?: ParameterActualInput[];
  materialConsumptions?: MaterialConsumptionInput[];
}

// Parameter Definition Types
export type MashingParameterType = 'Float' | 'Int' | 'Boolean' | 'Text' | 'Enum';

export interface MashingStepParameterDefinition {
  id: string;
  stepType: string;
  parameterName: string;
  displayName: string;
  description?: string;
  parameterType: MashingParameterType;
  unit?: string;
  isRequired: boolean;
  defaultValue?: string;
  validationMin?: number;
  validationMax?: number;
  deviationThreshold?: number;
  displayOrder: number;
  category?: string;
  enumValues?: string[];
}

// ===== Schedule Order Types for List View =====

export interface MashingScheduleOrderItem {
  id: string;
  queueIndex?: number;
  scheduleOrder?: {
    id: string;
    name?: string;
    status?: string;
    estimatedStart?: string;
    estimatedEnd?: string;
    scheduleOrderRecipe?: {
      id: string;
      Recipe: string;
    };
  };
}

// ===== GraphQL Queries =====

/**
 * Get mashing state for a specific schedule order
 */
export const GET_MASHING_STATE = gql`
  query GetMashingState($scheduleOrderId: String!) {
    mashingState(scheduleOrderId: $scheduleOrderId) {
      scheduleOrderId
      batchId
      currentStep {
        stepExecutionId
        mashingProtocolStepId
        stepName
        stepIndex
        stepType
        grainType
        displayName
        state
        targetTemperature
        targetDuration
        actualStartTime
        elapsedSeconds
        linkedBomItems {
          id
          itemId
          itemName
          quantityPlanned
          units
        }
      }
      completedSteps {
        stepExecutionId
        mashingProtocolStepId
        stepName
        stepIndex
        actualTemperature
        actualDuration
        completedAt
      }
      pendingSteps {
        id
        index
        stepType
        grainType
        displayName
        promptMessage
        temperatureSetpoint
        stepTime
        linkedBomItems {
          id
          itemId
          itemName
          quantityPlanned
          units
        }
      }
      overallProgress
    }
  }
`;

/**
 * Get parameter definitions for a step type
 */
export const GET_STEP_PARAMETER_DEFINITIONS = gql`
  query GetStepParameterDefinitions($stepType: EnumMashingProtocolStepStepType!) {
    mashingStepParameterDefinitions(stepType: $stepType) {
      id
      stepType
      parameterName
      displayName
      description
      parameterType
      unit
      isRequired
      defaultValue
      validationMin
      validationMax
      deviationThreshold
      displayOrder
      category
      enumValues
    }
  }
`;

/**
 * Get specific step execution details
 */
export const GET_MASHING_STEP_EXECUTION = gql`
  query GetMashingStepExecution(
    $scheduleOrderId: String!
    $mashingProtocolStepId: String!
  ) {
    mashingStepExecution(
      scheduleOrderId: $scheduleOrderId
      mashingProtocolStepId: $mashingProtocolStepId
    ) {
      id
      batchId
      phase
      stepIndex
      stepName
      state
      previousState
      actualStartTime
      actualEndTime
      actualDuration
      startedBy
      completedBy
      createdAt
    }
  }
`;

/**
 * Get schedule orders with mashing in progress (queue index <= 0)
 * Used for the mashing execution list view
 */
export const GET_MASHING_SCHEDULE_ORDERS = gql`
  query GetMashingScheduleOrders {
    scheduleOrderQueues(
      where: { queueIndex: { lte: 0 } }
      orderBy: { queueIndex: Asc }
    ) {
      id
      queueIndex
      scheduleOrder {
        id
        name
        status
        estimatedStart
        estimatedEnd
        scheduleOrderRecipe {
          id
          Recipe
        }
      }
    }
  }
`;

/**
 * Get batch deviations for a batch
 */
export const GET_BATCH_DEVIATIONS = gql`
  query GetBatchDeviations($batchId: String!) {
    batchDeviations(where: { batchId: { equals: $batchId } }) {
      id
      batchId
      deviationType
      severity
      status
      parameterName
      plannedValue
      actualValue
      deviationPercent
      units
      description
      isAutoDetected
      detectedAt
      detectedBy
    }
  }
`;

// ===== GraphQL Mutations =====

/**
 * Start a mashing step (transition to Running)
 */
export const START_MASHING_STEP = gql`
  mutation StartMashingStep(
    $scheduleOrderId: String!
    $mashingProtocolStepId: String!
  ) {
    startMashingStep(
      scheduleOrderId: $scheduleOrderId
      mashingProtocolStepId: $mashingProtocolStepId
    ) {
      id
      batchId
      phase
      stepIndex
      stepName
      state
      previousState
      actualStartTime
      actualEndTime
      actualDuration
      startedBy
      completedBy
      createdAt
    }
  }
`;

/**
 * Complete a mashing step with actuals (temperature, duration)
 */
export const COMPLETE_MASHING_STEP = gql`
  mutation CompleteMashingStep($input: CompleteMashingStepInput!) {
    completeMashingStep(input: $input) {
      stepExecution {
        id
        batchId
        phase
        stepIndex
        stepName
        state
        previousState
        actualStartTime
        actualEndTime
        actualDuration
        startedBy
        completedBy
        createdAt
      }
      actual {
        id
        actualValue
        timeActualValue
        stepCompletedAt
        createdBy
        createdAt
      }
      deviations {
        id
        batchId
        deviationType
        severity
        status
        parameterName
        plannedValue
        actualValue
        deviationPercent
        units
        description
        isAutoDetected
        detectedAt
        detectedBy
      }
    }
  }
`;

/**
 * Pause a running step
 */
export const PAUSE_MASHING_STEP = gql`
  mutation PauseMashingStep($input: PauseMashingStepInput!) {
    pauseMashingStep(input: $input) {
      id
      batchId
      phase
      stepIndex
      stepName
      state
      previousState
      actualStartTime
      actualEndTime
      actualDuration
      startedBy
      completedBy
      createdAt
    }
  }
`;

/**
 * Resume a paused step
 */
export const RESUME_MASHING_STEP = gql`
  mutation ResumeMashingStep($stepExecutionId: String!) {
    resumeMashingStep(stepExecutionId: $stepExecutionId) {
      id
      batchId
      phase
      stepIndex
      stepName
      state
      previousState
      actualStartTime
      actualEndTime
      actualDuration
      startedBy
      completedBy
      createdAt
    }
  }
`;

/**
 * Hold a step for exception handling (requires reason)
 */
export const HOLD_MASHING_STEP = gql`
  mutation HoldMashingStep($input: HoldMashingStepInput!) {
    holdMashingStep(input: $input) {
      id
      batchId
      phase
      stepIndex
      stepName
      state
      previousState
      actualStartTime
      actualEndTime
      actualDuration
      startedBy
      completedBy
      createdAt
    }
  }
`;

/**
 * Abort a step (requires reason)
 */
export const ABORT_MASHING_STEP = gql`
  mutation AbortMashingStep($input: AbortMashingStepInput!) {
    abortMashingStep(input: $input) {
      id
      batchId
      phase
      stepIndex
      stepName
      state
      previousState
      actualStartTime
      actualEndTime
      actualDuration
      startedBy
      completedBy
      createdAt
    }
  }
`;
