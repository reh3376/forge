import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionEventService } from "../productionEvent/productionEvent.service";
import { ClsService } from "nestjs-cls";
import {
  EnumS88StepState,
  EnumProductionEventType,
  EnumProductionEventCategory,
  StepExecution,
} from "@prisma/client";
import { CreateStepExecutionInput } from "./dto/create-step-execution.input";
import {
  SfcStateResponse,
  SfcPhaseState,
  SfcStepSummary,
} from "./dto/sfc-state-response";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";

export const VALID_STATE_TRANSITIONS: Record<
  EnumS88StepState,
  EnumS88StepState[]
> = {
  [EnumS88StepState.Idle]: [EnumS88StepState.Running],
  [EnumS88StepState.Running]: [
    EnumS88StepState.Complete,
    EnumS88StepState.Paused,
    EnumS88StepState.Held,
    EnumS88StepState.Stopping,
    EnumS88StepState.Aborting,
  ],
  [EnumS88StepState.Paused]: [
    EnumS88StepState.Running,
    EnumS88StepState.Restarting,
    EnumS88StepState.Aborting,
  ],
  [EnumS88StepState.Held]: [
    EnumS88StepState.Restarting,
    EnumS88StepState.Aborting,
  ],
  [EnumS88StepState.Stopping]: [EnumS88StepState.Stopped],
  [EnumS88StepState.Stopped]: [EnumS88StepState.Restarting],
  [EnumS88StepState.Aborting]: [EnumS88StepState.Aborted],
  [EnumS88StepState.Aborted]: [],
  [EnumS88StepState.Restarting]: [EnumS88StepState.Running],
  [EnumS88StepState.Complete]: [],
};

@Injectable()
export class StepExecutionService {
  private readonly logger = new Logger(StepExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productionEventService: ProductionEventService,
    private readonly cls: ClsService,
    private readonly mqttDomainPublisher: MqttDomainPublisherService
  ) {}

  private getCurrentUser(): string {
    return this.cls.get("userId") || "system";
  }

  validateStateTransition(
    currentState: EnumS88StepState,
    targetState: EnumS88StepState
  ): void {
    const validTargets = VALID_STATE_TRANSITIONS[currentState];
    if (!validTargets.includes(targetState)) {
      throw new BadRequestException(
        `Invalid state transition from ${currentState} to ${targetState}. ` +
          `Valid transitions: ${
            validTargets.join(", ") || "none (terminal state)"
          }`
      );
    }
  }

  buildStateHistory(
    existingHistory: any,
    state: EnumS88StepState,
    reason?: string
  ): any[] {
    const history = Array.isArray(existingHistory) ? [...existingHistory] : [];
    history.push({
      state,
      timestamp: new Date().toISOString(),
      userId: this.getCurrentUser(),
      reason: reason || null,
    });
    return history;
  }

  async createStepExecution(
    input: CreateStepExecutionInput
  ): Promise<StepExecution> {
    const userId = this.getCurrentUser();

    const batch = await this.prisma.batch.findUnique({
      where: { id: input.batchId },
    });
    if (!batch) {
      throw new NotFoundException(`Batch not found: ${input.batchId}`);
    }

    const existing = await this.prisma.stepExecution.findUnique({
      where: {
        batchId_phase_branchIndex_stepIndex: {
          batchId: input.batchId,
          phase: input.phase as any,
          branchIndex: input.branchIndex || 0,
          stepIndex: input.stepIndex,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Step execution already exists for batch ${input.batchId}, ` +
          `phase ${input.phase}, branch ${input.branchIndex || 0}, step ${
            input.stepIndex
          }`
      );
    }

    const stepExecution = await this.prisma.stepExecution.create({
      data: {
        batchId: input.batchId,
        phase: input.phase as any,
        stepName: input.stepName,
        stepIndex: input.stepIndex,
        branchIndex: input.branchIndex || 0,
        mashingProtocolStepId: input.mashingProtocolStepId,
        phaseProtocolStepId: input.phaseProtocolStepId,
        operationName: input.operationName,
        plannedDuration: input.plannedDuration,
        plannedStartTime: input.plannedStartTime,
        plannedEndTime: input.plannedEndTime,
        state: EnumS88StepState.Idle,
        stateHistory: this.buildStateHistory(null, EnumS88StepState.Idle),
        createdBy: userId,
      },
    });

    this.logger.log(
      `Created step execution: ${stepExecution.id} for batch ${input.batchId}`
    );
    return stepExecution;
  }

  async startStep(stepExecutionId: string): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);
    this.validateStateTransition(step.state, EnumS88StepState.Running);

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Running,
        previousState: step.state,
        actualStartTime: new Date(),
        startedBy: this.getCurrentUser(),
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Running
        ),
      },
    });

    await this.prisma.batch.update({
      where: { id: step.batchId },
      data: { currentStepExecutionId: stepExecutionId },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.StepStarted,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Step Started: ${step.stepName}`,
      phase: step.phase,
      stepIndex: step.stepIndex,
      branchIndex: step.branchIndex,
      previousState: step.state,
      newState: EnumS88StepState.Running,
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "step_started",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId },
    });

    this.logger.log(`Step started: ${step.stepName}`);
    return updatedStep;
  }

  async completeStep(stepExecutionId: string): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);
    this.validateStateTransition(step.state, EnumS88StepState.Complete);

    const actualEndTime = new Date();
    const actualDuration = step.actualStartTime
      ? Math.floor(
          (actualEndTime.getTime() - step.actualStartTime.getTime()) / 1000
        )
      : null;

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Complete,
        previousState: step.state,
        actualEndTime,
        actualDuration,
        completedBy: this.getCurrentUser(),
        exitConditionMet: true,
        exitConditionMetAt: actualEndTime,
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Complete
        ),
      },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.StepCompleted,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Step Completed: ${step.stepName}`,
      phase: step.phase,
      stepIndex: step.stepIndex,
      branchIndex: step.branchIndex,
      previousState: step.state,
      newState: EnumS88StepState.Complete,
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "step_completed",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId },
    });

    this.logger.log(
      `Step completed: ${step.stepName} (duration: ${actualDuration}s)`
    );
    return updatedStep;
  }

  async pauseStep(
    stepExecutionId: string,
    reason?: string
  ): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);
    this.validateStateTransition(step.state, EnumS88StepState.Paused);

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Paused,
        previousState: step.state,
        pausedBy: this.getCurrentUser(),
        pauseReason: reason,
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Paused,
          reason
        ),
      },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.StepPaused,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Step Paused: ${step.stepName}`,
      description: reason,
      phase: step.phase,
      stepIndex: step.stepIndex,
      branchIndex: step.branchIndex,
      previousState: step.state,
      newState: EnumS88StepState.Paused,
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "step_paused",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId },
    });

    this.logger.log(`Step paused: ${step.stepName}`);
    return updatedStep;
  }

  async resumeStep(stepExecutionId: string): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);
    this.validateStateTransition(step.state, EnumS88StepState.Restarting);

    // Transition through Restarting to Running
    await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Restarting,
        previousState: step.state,
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Restarting
        ),
      },
    });

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Running,
        previousState: EnumS88StepState.Restarting,
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Running
        ),
      },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.StepResumed,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Step Resumed: ${step.stepName}`,
      phase: step.phase,
      stepIndex: step.stepIndex,
      branchIndex: step.branchIndex,
      previousState: step.state,
      newState: EnumS88StepState.Running,
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "step_resumed",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId },
    });

    this.logger.log(`Step resumed: ${step.stepName}`);
    return updatedStep;
  }

  async holdStep(
    stepExecutionId: string,
    reason: string
  ): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);
    this.validateStateTransition(step.state, EnumS88StepState.Held);

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Held,
        previousState: step.state,
        heldBy: this.getCurrentUser(),
        holdReason: reason,
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Held,
          reason
        ),
      },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.StepHeld,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Step Held: ${step.stepName}`,
      description: reason,
      phase: step.phase,
      stepIndex: step.stepIndex,
      branchIndex: step.branchIndex,
      previousState: step.state,
      newState: EnumS88StepState.Held,
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "step_held",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId },
    });

    this.logger.warn(`Step held: ${step.stepName} - ${reason}`);
    return updatedStep;
  }

  async abortStep(
    stepExecutionId: string,
    reason: string
  ): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);
    this.validateStateTransition(step.state, EnumS88StepState.Aborting);

    // Transition through Aborting to Aborted
    await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Aborting,
        previousState: step.state,
        abortedBy: this.getCurrentUser(),
        abortReason: reason,
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Aborting,
          reason
        ),
      },
    });

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        state: EnumS88StepState.Aborted,
        previousState: EnumS88StepState.Aborting,
        actualEndTime: new Date(),
        stateHistory: this.buildStateHistory(
          step.stateHistory,
          EnumS88StepState.Aborted,
          reason
        ),
      },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.StepAborted,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Step Aborted: ${step.stepName}`,
      description: reason,
      phase: step.phase,
      stepIndex: step.stepIndex,
      branchIndex: step.branchIndex,
      previousState: step.state,
      newState: EnumS88StepState.Aborted,
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "step_aborted",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId },
    });

    this.logger.error(`Step aborted: ${step.stepName} - ${reason}`);
    return updatedStep;
  }

  async allocateEquipment(
    stepExecutionId: string,
    assetId: string,
    equipmentMode?: string
  ): Promise<StepExecution> {
    const step = await this.findStepOrThrow(stepExecutionId);

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException(`Asset not found: ${assetId}`);
    }

    const updatedStep = await this.prisma.stepExecution.update({
      where: { id: stepExecutionId },
      data: {
        allocatedAssetId: assetId,
        equipmentMode,
      },
    });

    await this.productionEventService.logEvent({
      batchId: step.batchId,
      eventType: EnumProductionEventType.EquipmentAllocated,
      eventCategory: EnumProductionEventCategory.EquipmentStatus,
      title: `Equipment Allocated: ${asset.name}`,
      description: equipmentMode ? `Mode: ${equipmentMode}` : undefined,
      phase: step.phase,
      stepIndex: step.stepIndex,
      assetId,
    });
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "StepExecution",
      eventType: "equipment_allocated",
      data: updatedStep as any,
      context: { phase: step.phase, batchId: step.batchId, assetId },
    });

    return updatedStep;
  }

  async getSfcState(batchId: string): Promise<SfcStateResponse> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException(`Batch not found: ${batchId}`);
    }

    const steps = await this.prisma.stepExecution.findMany({
      where: { batchId },
      orderBy: [{ phase: "asc" }, { branchIndex: "asc" }, { stepIndex: "asc" }],
    });

    const currentStep = batch.currentStepExecutionId
      ? await this.prisma.stepExecution.findUnique({
          where: { id: batch.currentStepExecutionId },
        })
      : null;

    const phaseGroups = new Map<string, StepExecution[]>();
    for (const step of steps) {
      if (!phaseGroups.has(step.phase)) {
        phaseGroups.set(step.phase, []);
      }
      phaseGroups.get(step.phase)!.push(step);
    }

    const phases: SfcPhaseState[] = [];
    for (const [phase, phaseSteps] of phaseGroups) {
      const stepSummaries: SfcStepSummary[] = phaseSteps.map((step) => ({
        stepIndex: step.stepIndex,
        branchIndex: step.branchIndex,
        stepName: step.stepName,
        state: step.state,
        isActive: step.state === EnumS88StepState.Running,
        isComplete: step.state === EnumS88StepState.Complete,
        actualStartTime: step.actualStartTime,
        actualEndTime: step.actualEndTime,
        actualDuration: step.actualDuration,
      }));

      const currentStepIndex = phaseSteps.findIndex(
        (s) => s.state === EnumS88StepState.Running
      );
      const completedSteps = phaseSteps.filter(
        (s) => s.state === EnumS88StepState.Complete
      ).length;

      phases.push({
        phase: phase as any,
        steps: stepSummaries,
        currentStepIndex: currentStepIndex >= 0 ? currentStepIndex : -1,
        totalSteps: phaseSteps.length,
        completedSteps,
      });
    }

    const activeSteps = steps.filter(
      (s) => s.state === EnumS88StepState.Running
    );
    const recentlyCompletedSteps = steps
      .filter((s) => s.state === EnumS88StepState.Complete && s.actualEndTime)
      .sort((a, b) => b.actualEndTime!.getTime() - a.actualEndTime!.getTime())
      .slice(0, 5);

    return {
      batchId,
      currentStep: currentStep as any,
      phases,
      activeSteps: activeSteps as any[],
      recentlyCompletedSteps: recentlyCompletedSteps as any[],
    };
  }

  async getStepExecutions(
    batchId: string,
    phase?: string
  ): Promise<StepExecution[]> {
    const where: any = { batchId };
    if (phase) {
      where.phase = phase;
    }
    return this.prisma.stepExecution.findMany({
      where,
      orderBy: [{ phase: "asc" }, { branchIndex: "asc" }, { stepIndex: "asc" }],
    });
  }

  async getCurrentStep(batchId: string): Promise<StepExecution | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { currentStepExecutionId: true },
    });
    if (!batch?.currentStepExecutionId) {
      return null;
    }
    return this.prisma.stepExecution.findUnique({
      where: { id: batch.currentStepExecutionId },
    });
  }

  async getStepExecution(id: string): Promise<StepExecution | null> {
    return this.prisma.stepExecution.findUnique({
      where: { id },
    });
  }

  async getBatch(stepExecutionId: string): Promise<any | null> {
    const step = await this.prisma.stepExecution.findUnique({
      where: { id: stepExecutionId },
      select: { batchId: true },
    });
    if (!step) return null;
    return this.prisma.batch.findUnique({
      where: { id: step.batchId },
    });
  }

  async getAllocatedAsset(stepExecutionId: string): Promise<any | null> {
    const step = await this.prisma.stepExecution.findUnique({
      where: { id: stepExecutionId },
      select: { allocatedAssetId: true },
    });
    if (!step?.allocatedAssetId) return null;
    return this.prisma.asset.findUnique({
      where: { id: step.allocatedAssetId },
    });
  }

  private async findStepOrThrow(
    stepExecutionId: string
  ): Promise<StepExecution> {
    const step = await this.prisma.stepExecution.findUnique({
      where: { id: stepExecutionId },
    });
    if (!step) {
      throw new NotFoundException(
        `Step execution not found: ${stepExecutionId}`
      );
    }
    return step;
  }
}
