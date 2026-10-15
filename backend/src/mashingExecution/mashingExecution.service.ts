import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StepExecutionService } from "../stepExecution/stepExecution.service";
import { BatchDeviationService } from "../batchDeviation/batchDeviation.service";
import { BatchService } from "../batch/batch.service";
import {
  MashingStepParameterService,
  ParameterActualInput,
} from "../mashingStepParameter/mashingStepParameter.service";
import { ClsService } from "nestjs-cls";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import {
  EnumS88StepState,
  EnumProductionPhase,
  EnumDeviationType,
  EnumDeviationSeverity,
  EnumMashingProtocolStepStepType,
} from "@prisma/client";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";

const TEMPERATURE_TOLERANCE_DEGREES = 5;
const TIME_DEVIATION_PERCENT_THRESHOLD = 10;
const MINOR_DEVIATION_MAX = 10;
const MAJOR_DEVIATION_MAX = 25;

// Grain step types (legacy individual types + new consolidated GrainAdd)
const GRAIN_STEP_TYPES = new Set([
  "GrainAdd",
  "Corn",
  "Wheat",
  "Rye",
  "Malt",
  "PreMalt",
  "SpecialtyGrainAdd",
]);

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
  /** Structured parameter actuals */
  parameters?: ParameterActualInput[];
  /** Material consumption during this step */
  materialConsumptions?: MaterialConsumptionInput[];
}

@Injectable()
export class MashingExecutionService {
  constructor(
    private prisma: PrismaService,
    private stepExecutionService: StepExecutionService,
    private batchDeviationService: BatchDeviationService,
    private batchService: BatchService,
    private mashingStepParameterService: MashingStepParameterService,
    private cls: ClsService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
    private mqttDomainPublisher: MqttDomainPublisherService
  ) {}

  private getCurrentUser(): string {
    return this.cls.get("userId") || "system";
  }

  async getOrCreateMashingBatch(scheduleOrderId: string): Promise<string> {
    const userId = this.getCurrentUser();

    const existingBatch = await this.prisma.batch.findFirst({
      where: {
        scheduleOrderRecipeInstance: {
          scheduleOrderId,
        },
        batchId: { startsWith: "MAS" },
      },
    });

    if (existingBatch) {
      return existingBatch.id;
    }

    const soInstance = await this.prisma.scheduleOrderRecipeInstance.findFirst({
      where: { scheduleOrderId },
    });

    if (!soInstance) {
      throw new NotFoundException(
        `ScheduleOrderRecipeInstance not found for schedule order: ${scheduleOrderId}`
      );
    }

    const recipeInfo = await this.prisma.scheduleOrderRecipeInstance.findUnique(
      {
        where: { id: soInstance.id },
        include: { recipe: true },
      }
    );

    const batch = await this.batchService.GetBatchId({
      operation: "Mashing01",
      createdBy: userId,
    } as any);

    await this.prisma.batch.update({
      where: { id: batch.id },
      data: {
        scheduleOrderRecipeInstance: {
          connect: { id: soInstance.id },
        },
        recipeName: recipeInfo?.recipe?.Recipe || null,
        recipeRevision: recipeInfo?.recipe?.revision || null,
      },
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "MashingExecution",
      eventType: "batch_created",
      data: { id: batch.id, batchId: batch.batchId },
      context: { scheduleOrderId, phase: "Mashing" },
    });

    this.logger.log("info", `Created mashing batch: ${batch.batchId}`, {
      service: "MashingExecutionService",
      batchId: batch.id,
      scheduleOrderId,
    });

    return batch.id;
  }

  async startMashingStep(
    scheduleOrderId: string,
    mashingProtocolStepId: string
  ) {
    const mashingStep = await this.prisma.mashingProtocolStep.findUnique({
      where: { id: mashingProtocolStepId },
      include: {
        mashingProtocol: {
          include: {
            scheduleOrderRecipeInstance: true,
          },
        },
      },
    });

    if (!mashingStep) {
      throw new NotFoundException(
        `MashingProtocolStep not found: ${mashingProtocolStepId}`
      );
    }

    if (
      mashingStep.mashingProtocol?.scheduleOrderRecipeInstance
        ?.scheduleOrderId !== scheduleOrderId
    ) {
      throw new BadRequestException(
        `MashingProtocolStep does not belong to schedule order: ${scheduleOrderId}`
      );
    }

    const batchId = await this.getOrCreateMashingBatch(scheduleOrderId);

    const existingExecution = await this.prisma.stepExecution.findFirst({
      where: {
        batchId,
        mashingProtocolStepId,
      },
    });

    if (existingExecution) {
      if (existingExecution.state !== EnumS88StepState.Idle) {
        throw new BadRequestException(
          `Step execution already exists and is in state: ${existingExecution.state}. ` +
            `Use resume, pause, or other state transitions as appropriate.`
        );
      }
      return this.stepExecutionService.startStep(existingExecution.id);
    }

    const plannedDuration = mashingStep.stepTime
      ? mashingStep.stepTime * 60
      : undefined;
    const stepName =
      mashingStep.promptMessage ||
      `${mashingStep.stepType || "Step"} - Step ${mashingStep.index}`;

    const stepExecution = await this.stepExecutionService.createStepExecution({
      batchId,
      phase: EnumProductionPhase.Mashing,
      stepIndex: mashingStep.index ?? 0,
      stepName,
      mashingProtocolStepId,
      operationName: mashingStep.stepType || undefined,
      plannedDuration,
    });

    const startedStep = await this.stepExecutionService.startStep(
      stepExecution.id
    );

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "MashingExecution",
      eventType: "mashing_step_started",
      data: startedStep as any,
      context: { scheduleOrderId, phase: "Mashing" },
    });

    this.logger.log("info", `Started mashing step: ${startedStep.stepName}`, {
      service: "MashingExecutionService",
      stepExecutionId: startedStep.id,
      scheduleOrderId,
      mashingProtocolStepId,
    });

    return startedStep;
  }

  async completeMashingStep(
    stepExecutionId: string,
    actuals: MashingStepActualsInput
  ) {
    const userId = this.getCurrentUser();

    const stepExecution = await this.prisma.stepExecution.findUnique({
      where: { id: stepExecutionId },
      include: { batch: true },
    });

    if (!stepExecution) {
      throw new NotFoundException(
        `StepExecution not found: ${stepExecutionId}`
      );
    }

    if (!stepExecution.mashingProtocolStepId) {
      throw new BadRequestException(
        `StepExecution is not linked to a mashing protocol step`
      );
    }

    const mashingStep = await this.prisma.mashingProtocolStep.findUnique({
      where: { id: stepExecution.mashingProtocolStepId },
      include: { mashingProtocol: true },
    });

    if (!mashingStep || !mashingStep.mashingProtocol) {
      throw new NotFoundException(
        `MashingProtocolStep not found: ${stepExecution.mashingProtocolStepId}`
      );
    }

    const completedStep = await this.stepExecutionService.completeStep(
      stepExecutionId
    );

    const actualDuration =
      actuals.actualDuration ||
      (completedStep.actualStartTime && completedStep.actualEndTime
        ? Math.floor(
            (completedStep.actualEndTime.getTime() -
              completedStep.actualStartTime.getTime()) /
              1000
          )
        : undefined);

    const stepActual = await this.prisma.mashingProtocolStepActual.create({
      data: {
        mashingProtocolId: mashingStep.mashingProtocol.id,
        mashingProtocolStepId: mashingStep.id,
        actualValue: actuals.actualTemperature,
        timeActualValue:
          actuals.timeActualValue ||
          (actualDuration ? actualDuration / 60 : null),
        stepCompletedAt: completedStep.actualEndTime || new Date(),
        stepExecutionId: completedStep.id,
        createdBy: userId,
      },
    });

    const deviations = [];

    // Record structured parameter actuals if provided
    if (actuals.parameters?.length) {
      const stepType = mashingStep.stepType as EnumMashingProtocolStepStepType;
      const { deviations: paramDeviations } =
        await this.mashingStepParameterService.recordParameterActuals(
          stepActual.id,
          completedStep.id,
          stepType,
          actuals.parameters,
          userId
        );

      // Create BatchDeviation for each out-of-tolerance parameter
      for (const paramDev of paramDeviations) {
        const severity = this.calculateSeverity(paramDev.deviationPercent);
        const deviation = await this.batchDeviationService.recordDeviation({
          batchId: stepExecution.batchId,
          deviationType: EnumDeviationType.ParameterOutOfSpec,
          severity,
          parameterName: paramDev.parameterName,
          plannedValue: paramDev.plannedValue,
          actualValue: paramDev.actualValue,
          units: paramDev.unit ?? undefined,
          phase: EnumProductionPhase.Mashing,
          stepIndex: mashingStep.index ?? undefined,
          stepExecutionId: completedStep.id,
          isAutoDetected: true,
          description: `Parameter ${paramDev.parameterName} deviation: ${
            paramDev.actualValue
          }${paramDev.unit || ""} vs planned ${paramDev.plannedValue}${
            paramDev.unit || ""
          } (${paramDev.deviationPercent.toFixed(1)}% > ${
            paramDev.threshold
          }% threshold)`,
        });
        deviations.push(deviation);
      }
    }

    // Record material consumption if provided
    if (actuals.materialConsumptions?.length) {
      // Get the schedule order recipe instance for linking
      const soInstance =
        await this.prisma.scheduleOrderRecipeInstance.findFirst({
          where: {
            mashingProtocols: {
              some: { id: mashingStep.mashingProtocol.id },
            },
          },
        });

      for (const consumption of actuals.materialConsumptions) {
        await this.prisma.recipeBomActual.create({
          data: {
            recipeBomItemId: consumption.recipeBomItemId,
            quantityActual: consumption.quantityActual,
            lotNumber: consumption.lotNumber,
            addRate: consumption.addRate,
            addRateUnit: consumption.addRateUnit,
            stepType: mashingStep.stepType,
            mashingProtocolStepActualId: stepActual.id,
            scheduleOrderRecipeInstanceId: soInstance?.id,
            consumedAt: new Date(),
            createdBy: userId,
          },
        });
      }

      this.logger.log(
        "info",
        `Recorded ${actuals.materialConsumptions.length} material consumption(s) for step`,
        {
          service: "MashingExecutionService",
          stepExecutionId: completedStep.id,
          consumptions: actuals.materialConsumptions.length,
        }
      );
    }

    // Temperature deviation check
    if (mashingStep.temperatureSetpoint !== null) {
      const tempDeviation = Math.abs(
        actuals.actualTemperature - mashingStep.temperatureSetpoint
      );
      if (tempDeviation > TEMPERATURE_TOLERANCE_DEGREES) {
        const deviationPercent =
          (tempDeviation / mashingStep.temperatureSetpoint) * 100;
        const severity = this.calculateSeverity(deviationPercent);

        const deviation = await this.batchDeviationService.recordDeviation({
          batchId: stepExecution.batchId,
          deviationType: EnumDeviationType.ParameterOutOfSpec,
          severity,
          parameterName: "MashTemperature",
          plannedValue: mashingStep.temperatureSetpoint,
          actualValue: actuals.actualTemperature,
          units: "\u00B0F",
          upperLimit:
            mashingStep.temperatureSetpoint + TEMPERATURE_TOLERANCE_DEGREES,
          lowerLimit:
            mashingStep.temperatureSetpoint - TEMPERATURE_TOLERANCE_DEGREES,
          phase: EnumProductionPhase.Mashing,
          stepIndex: mashingStep.index ?? undefined,
          stepExecutionId: completedStep.id,
          isAutoDetected: true,
          description: `Temperature deviation detected: ${actuals.actualTemperature}\u00B0F vs setpoint ${mashingStep.temperatureSetpoint}\u00B0F`,
        });

        deviations.push(deviation);
      }
    }

    // Timing deviation check
    if (mashingStep.stepTime && actualDuration) {
      const plannedSeconds = mashingStep.stepTime * 60;
      const timeDeviationPercent =
        (Math.abs(actualDuration - plannedSeconds) / plannedSeconds) * 100;

      if (timeDeviationPercent > TIME_DEVIATION_PERCENT_THRESHOLD) {
        const severity = this.calculateSeverity(timeDeviationPercent);

        const deviation = await this.batchDeviationService.recordDeviation({
          batchId: stepExecution.batchId,
          deviationType: EnumDeviationType.TimingDeviation,
          severity,
          parameterName: "StepDuration",
          plannedValue: plannedSeconds,
          actualValue: actualDuration,
          units: "seconds",
          phase: EnumProductionPhase.Mashing,
          stepIndex: mashingStep.index ?? undefined,
          stepExecutionId: completedStep.id,
          isAutoDetected: true,
          description: `Timing deviation detected: ${actualDuration}s vs planned ${plannedSeconds}s`,
        });

        deviations.push(deviation);
      }
    }

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "MashingExecution",
      eventType: "mashing_step_completed",
      data: {
        id: completedStep.id,
        stepName: completedStep.stepName,
        batchId: stepExecution.batchId,
        actualTemperature: actuals.actualTemperature,
        actualDuration,
        deviationCount: deviations.length,
      },
      context: { batchId: stepExecution.batchId, phase: "Mashing" },
    });

    this.logger.log(
      "info",
      `Completed mashing step: ${completedStep.stepName} with ${deviations.length} deviation(s)`,
      {
        service: "MashingExecutionService",
        stepExecutionId: completedStep.id,
        actualTemperature: actuals.actualTemperature,
        actualDuration,
        deviationCount: deviations.length,
      }
    );

    return {
      stepExecution: this.toStepExecutionOutput(completedStep),
      actual: this.toMashingStepActualOutput(stepActual),
      deviations: deviations.map((d) => this.toBatchDeviationOutput(d)),
    };
  }

  async pauseMashingStep(stepExecutionId: string, reason?: string) {
    return this.stepExecutionService.pauseStep(stepExecutionId, reason);
  }

  async resumeMashingStep(stepExecutionId: string) {
    return this.stepExecutionService.resumeStep(stepExecutionId);
  }

  async holdMashingStep(stepExecutionId: string, reason: string) {
    return this.stepExecutionService.holdStep(stepExecutionId, reason);
  }

  async abortMashingStep(stepExecutionId: string, reason: string) {
    return this.stepExecutionService.abortStep(stepExecutionId, reason);
  }

  async getMashingState(scheduleOrderId: string) {
    const soInstance: any =
      await this.prisma.scheduleOrderRecipeInstance.findFirst({
        where: { scheduleOrderId },
        include: {
          mashingProtocols: {
            include: {
              steps: {
                orderBy: { index: "asc" },
                include: {
                  // Include linked BOM items for material steps
                  recipeBomItem: {
                    include: {
                      item: true,
                      displayUnits: true,
                    },
                  },
                },
              },
              mashingProtocolStepActuals: {
                include: {
                  mashingProtocolStep: true,
                  parameterActuals: true,
                },
              },
            },
          },
          batches: {
            where: {
              batchId: { startsWith: "MAS" },
            },
          },
        },
      } as any);

    if (!soInstance) {
      throw new NotFoundException(
        `ScheduleOrderRecipeInstance not found for schedule order: ${scheduleOrderId}`
      );
    }

    const mashingProtocol = soInstance.mashingProtocols[0];
    const mashingBatch = soInstance.batches[0];

    let stepExecutions: any[] = [];
    if (mashingBatch) {
      stepExecutions = await this.prisma.stepExecution.findMany({
        where: {
          batchId: mashingBatch.id,
          phase: EnumProductionPhase.Mashing,
        },
        orderBy: { stepIndex: "asc" },
      });
    }

    let currentStep;
    const runningExecution = stepExecutions.find(
      (s) => s.state === EnumS88StepState.Running
    );

    if (runningExecution && mashingProtocol) {
      const mashingStep = mashingProtocol.steps.find(
        (s: any) => s.id === runningExecution.mashingProtocolStepId
      );

      if (mashingStep) {
        const elapsedSeconds = runningExecution.actualStartTime
          ? (Date.now() - runningExecution.actualStartTime.getTime()) / 1000
          : undefined;

        // Get linked BOM items for material steps
        const stepWithBom = mashingStep as any;
        const linkedBomItems =
          stepWithBom.recipeBomItem?.map((bom: any) => ({
            id: bom.id,
            itemId: bom.itemId,
            itemName:
              bom.item?.itemNumber || bom.item?.itemName || "Unknown Item",
            quantityPlanned: bom.quantity,
            units:
              bom.displayUnits?.unitName ||
              bom.displayUnits?.unitAbbreviation ||
              "",
          })) || [];

        // Get display info including grain type for GrainAdd steps
        const displayInfo = this.getStepDisplayInfo(stepWithBom);

        currentStep = {
          stepExecutionId: runningExecution.id,
          mashingProtocolStepId: mashingStep.id,
          stepName: runningExecution.stepName,
          stepIndex: mashingStep.index ?? 0,
          stepType: mashingStep.stepType || undefined,
          grainType: displayInfo.grainType,
          displayName: displayInfo.displayName,
          state: runningExecution.state,
          targetTemperature: mashingStep.temperatureSetpoint || undefined,
          targetDuration: mashingStep.stepTime
            ? mashingStep.stepTime * 60
            : undefined,
          actualStartTime: runningExecution.actualStartTime || undefined,
          elapsedSeconds,
          linkedBomItems,
        };
      }
    }

    const completedSteps = stepExecutions
      .filter((s: any) => s.state === EnumS88StepState.Complete)
      .map((s: any) => {
        const actual = mashingProtocol?.mashingProtocolStepActuals.find(
          (a: any) => a.mashingProtocolStepId === s.mashingProtocolStepId
        );
        return {
          stepExecutionId: s.id,
          mashingProtocolStepId: s.mashingProtocolStepId || "",
          stepName: s.stepName,
          stepIndex: s.stepIndex,
          actualTemperature: actual?.actualValue,
          actualDuration: s.actualDuration ?? undefined,
          completedAt: s.actualEndTime ?? undefined,
        };
      });

    const executedStepIds = new Set(
      stepExecutions.map((s) => s.mashingProtocolStepId)
    );
    const pendingSteps =
      mashingProtocol?.steps
        .filter((s: any) => !executedStepIds.has(s.id))
        .map((s: any) => {
          // Get display info including grain type for GrainAdd steps
          const displayInfo = this.getStepDisplayInfo(s);
          return {
            id: s.id,
            index: s.index ?? 0,
            stepType: s.stepType || undefined,
            grainType: displayInfo.grainType,
            displayName: displayInfo.displayName,
            promptMessage: s.promptMessage || undefined,
            temperatureSetpoint: s.temperatureSetpoint || undefined,
            stepTime: s.stepTime || undefined,
            // Include linked BOM items for material steps
            linkedBomItems:
              s.recipeBomItem?.map((bom: any) => ({
                id: bom.id,
                itemId: bom.itemId,
                itemName:
                  bom.item?.itemNumber || bom.item?.itemName || "Unknown Item",
                quantityPlanned: bom.quantity,
                units:
                  bom.displayUnits?.unitName ||
                  bom.displayUnits?.unitAbbreviation ||
                  "",
              })) || [],
          };
        }) || [];

    const totalSteps = mashingProtocol?.steps.length || 0;
    const completedCount = completedSteps.length;
    const overallProgress =
      totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

    return {
      scheduleOrderId,
      batchId: mashingBatch?.batchId,
      currentStep,
      completedSteps,
      pendingSteps,
      overallProgress,
    };
  }

  async getMashingStepExecution(
    scheduleOrderId: string,
    mashingProtocolStepId: string
  ) {
    const soInstance = await this.prisma.scheduleOrderRecipeInstance.findFirst({
      where: { scheduleOrderId },
      include: {
        batches: {
          where: {
            batchId: { startsWith: "MAS" },
          },
        },
      },
    });

    if (!soInstance || !soInstance.batches?.[0]) {
      return null;
    }

    return this.prisma.stepExecution.findFirst({
      where: {
        batchId: soInstance.batches[0].id,
        mashingProtocolStepId,
      },
    });
  }

  /**
   * Get parameter definitions for a specific step type.
   * Used by frontend to render dynamic inputs.
   */
  async getStepParameterDefinitions(stepType: EnumMashingProtocolStepStepType) {
    return this.mashingStepParameterService.getParameterDefinitions(stepType);
  }

  private calculateSeverity(deviationPercent: number): EnumDeviationSeverity {
    if (deviationPercent <= MINOR_DEVIATION_MAX) {
      return EnumDeviationSeverity.Minor;
    } else if (deviationPercent <= MAJOR_DEVIATION_MAX) {
      return EnumDeviationSeverity.Major;
    }
    return EnumDeviationSeverity.Critical;
  }

  private toStepExecutionOutput(step: any) {
    return {
      id: step.id,
      batchId: step.batchId,
      phase: step.phase,
      stepIndex: step.stepIndex,
      stepName: step.stepName,
      state: step.state,
      previousState: step.previousState || undefined,
      actualStartTime: step.actualStartTime || undefined,
      actualEndTime: step.actualEndTime || undefined,
      actualDuration: step.actualDuration || undefined,
      startedBy: step.startedBy || undefined,
      completedBy: step.completedBy || undefined,
      createdAt: step.createdAt,
    };
  }

  private toMashingStepActualOutput(actual: any) {
    return {
      id: actual.id,
      actualValue: actual.actualValue,
      timeActualValue: actual.timeActualValue || undefined,
      stepCompletedAt: actual.stepCompletedAt || undefined,
      createdBy: actual.createdBy,
      createdAt: actual.createdAt,
    };
  }

  private toBatchDeviationOutput(deviation: any) {
    return {
      id: deviation.id,
      batchId: deviation.batchId,
      deviationType: deviation.deviationType,
      severity: deviation.severity,
      status: deviation.status,
      parameterName: deviation.parameterName || undefined,
      plannedValue: deviation.plannedValue || undefined,
      actualValue: deviation.actualValue || undefined,
      deviationPercent: deviation.deviationPercent || undefined,
      units: deviation.units || undefined,
      description: deviation.description,
      isAutoDetected: deviation.isAutoDetected,
      detectedAt: deviation.detectedAt,
      detectedBy: deviation.detectedBy,
    };
  }

  /**
   * Derive grain type from linked BOM item(s).
   * For GrainAdd steps, the specific grain type is inferred from the item name.
   * This allows a single consolidated step type while maintaining categorization.
   */
  private getGrainTypeFromBomItem(
    item: { itemName?: string | null } | null
  ): string | null {
    if (!item?.itemName) return null;
    const name = item.itemName.toLowerCase();

    if (name.includes("corn")) return "Corn";
    if (name.includes("wheat")) return "Wheat";
    if (name.includes("rye")) return "Rye";
    if (name.includes("malt") || name.includes("barley")) return "Malt";
    if (name.includes("oat")) return "Oats";
    if (name.includes("spelt")) return "Spelt";
    if (name.includes("sorghum")) return "Sorghum";
    if (name.includes("rice")) return "Rice";

    return "Specialty Grain";
  }

  /**
   * Get display name for a step based on its type and linked BOM items.
   * For GrainAdd steps, includes the derived grain type from the BOM item.
   */
  private getStepDisplayInfo(step: {
    stepType?: string | null;
    promptMessage?: string | null;
    recipeBomItem?: Array<{ item?: { itemName?: string | null } | null }>;
  }): { displayName: string; grainType?: string } {
    const stepType = step.stepType;

    // For GrainAdd steps, derive grain type from linked BOM item
    if (stepType === "GrainAdd" && step.recipeBomItem?.length) {
      const firstItem = step.recipeBomItem[0]?.item ?? null;
      const grainType = this.getGrainTypeFromBomItem(firstItem);
      const itemName = firstItem?.itemName || "Unknown";
      return {
        displayName: grainType
          ? `${grainType} Add: ${itemName}`
          : `Grain Add: ${itemName}`,
        grainType: grainType || undefined,
      };
    }

    // For legacy grain step types, use the step type directly
    if (GRAIN_STEP_TYPES.has(stepType || "")) {
      const itemName = step.recipeBomItem?.[0]?.item?.itemName;
      return {
        displayName: itemName
          ? `${stepType}: ${itemName}`
          : stepType || "Grain Add",
        grainType:
          stepType === "SpecialtyGrainAdd"
            ? "Specialty Grain"
            : stepType || undefined,
      };
    }

    // Default: use promptMessage or stepType
    return {
      displayName: step.promptMessage || stepType || "Step",
    };
  }
}
