import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClsService } from "nestjs-cls";
import {
  BatchDeviation,
  EnumDeviationSeverity,
  EnumDeviationStatus,
} from "@prisma/client";
import { RecordDeviationInput } from "./dto/record-deviation.input";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";

@Injectable()
export class BatchDeviationService {
  private readonly logger = new Logger(BatchDeviationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly mqttDomainPublisher: MqttDomainPublisherService
  ) {}

  private getCurrentUser(): string {
    return this.cls.get("userId") || "system";
  }

  calculateDeviationPercent(
    planned: number | null,
    actual: number | null
  ): number | null {
    if (planned === null || actual === null || planned === 0) return null;
    return (Math.abs(actual - planned) / Math.abs(planned)) * 100;
  }

  determineSeverity(deviationPercent: number): EnumDeviationSeverity {
    if (deviationPercent <= 10) return EnumDeviationSeverity.Minor;
    if (deviationPercent <= 25) return EnumDeviationSeverity.Major;
    return EnumDeviationSeverity.Critical;
  }

  async recordDeviation(input: RecordDeviationInput): Promise<BatchDeviation> {
    const userId = this.getCurrentUser();

    const deviationPercent = this.calculateDeviationPercent(
      input.plannedValue ?? null,
      input.actualValue ?? null
    );

    const severity =
      input.severity ??
      (deviationPercent !== null
        ? this.determineSeverity(deviationPercent)
        : EnumDeviationSeverity.Minor);

    const deviation = await this.prisma.batchDeviation.create({
      data: {
        batchId: input.batchId,
        deviationType: input.deviationType,
        severity,
        isAutoDetected: input.isAutoDetected ?? false,
        parameterName: input.parameterName,
        plannedValue: input.plannedValue,
        actualValue: input.actualValue,
        deviationPercent,
        units: input.units,
        upperLimit: input.upperLimit,
        lowerLimit: input.lowerLimit,
        phase: input.phase,
        stepIndex: input.stepIndex,
        stepExecutionId: input.stepExecutionId,
        assetId: input.assetId,
        description: input.description,
        triggerEventId: input.triggerEventId,
        detectedBy: userId,
        createdBy: userId,
      },
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "BatchDeviation",
      eventType: "deviation_recorded",
      data: deviation as any,
      context: {
        severity: severity,
        phase: input.phase || undefined,
        assetId: input.assetId || undefined,
        batchId: input.batchId,
      },
    });

    this.logger.log(
      `Deviation recorded: ${input.deviationType} (${severity}) for batch ${input.batchId}`
    );

    return deviation;
  }

  async autoDetectFromParameterActual(
    batchId: string,
    parameterName: string,
    plannedValue: number | null,
    actualValue: number | null,
    upperLimit: number | null,
    lowerLimit: number | null,
    units: string | null,
    phase?: string,
    stepIndex?: number,
    triggerEventId?: string
  ): Promise<BatchDeviation | null> {
    if (plannedValue === null || actualValue === null) return null;

    const isOutOfSpec =
      (upperLimit !== null && actualValue > upperLimit) ||
      (lowerLimit !== null && actualValue < lowerLimit);

    if (!isOutOfSpec) return null;

    const deviationPercent = this.calculateDeviationPercent(
      plannedValue,
      actualValue
    );

    return this.recordDeviation({
      batchId,
      deviationType: "ParameterOutOfSpec" as any,
      parameterName,
      plannedValue,
      actualValue,
      units: units ?? undefined,
      upperLimit: upperLimit ?? undefined,
      lowerLimit: lowerLimit ?? undefined,
      phase: phase as any,
      stepIndex,
      isAutoDetected: true,
      description: `Auto-detected: ${parameterName} value ${actualValue} outside limits [${lowerLimit}, ${upperLimit}]`,
      triggerEventId,
    });
  }

  async startInvestigation(id: string): Promise<BatchDeviation> {
    const userId = this.getCurrentUser();
    const deviation = await this.findDeviationOrThrow(id);

    const updated = await this.prisma.batchDeviation.update({
      where: { id },
      data: {
        status: EnumDeviationStatus.UnderInvestigation,
        investigationStartedAt: new Date(),
        investigationStartedBy: userId,
        updatedBy: userId,
      },
    });
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "BatchDeviation",
      eventType: "investigation_started",
      data: updated as any,
      context: { batchId: updated.batchId },
    });
    return updated;
  }

  async resolveDeviation(
    id: string,
    correctiveAction: string
  ): Promise<BatchDeviation> {
    const userId = this.getCurrentUser();
    const deviation = await this.findDeviationOrThrow(id);

    const updated = await this.prisma.batchDeviation.update({
      where: { id },
      data: {
        status: EnumDeviationStatus.Resolved,
        correctiveAction,
        resolvedAt: new Date(),
        resolvedBy: userId,
        updatedBy: userId,
      },
    });
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "BatchDeviation",
      eventType: "resolved",
      data: updated as any,
      context: { batchId: updated.batchId },
    });
    return updated;
  }

  async closeDeviation(id: string): Promise<BatchDeviation> {
    const userId = this.getCurrentUser();
    const deviation = await this.findDeviationOrThrow(id);

    const updated = await this.prisma.batchDeviation.update({
      where: { id },
      data: {
        status: EnumDeviationStatus.Closed,
        closedAt: new Date(),
        closedBy: userId,
        updatedBy: userId,
      },
    });
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "BatchDeviation",
      eventType: "closed",
      data: updated as any,
      context: { batchId: updated.batchId },
    });
    return updated;
  }

  async getBatchDeviations(batchId: string): Promise<BatchDeviation[]> {
    return this.prisma.batchDeviation.findMany({
      where: { batchId },
      orderBy: { detectedAt: "desc" },
    });
  }

  async getOpenDeviations(): Promise<BatchDeviation[]> {
    return this.prisma.batchDeviation.findMany({
      where: {
        status: {
          in: [
            EnumDeviationStatus.Open,
            EnumDeviationStatus.UnderInvestigation,
            EnumDeviationStatus.PendingCorrectiveAction,
          ],
        },
      },
      orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    });
  }

  private async findDeviationOrThrow(id: string): Promise<BatchDeviation> {
    const deviation = await this.prisma.batchDeviation.findUnique({
      where: { id },
    });
    if (!deviation) {
      throw new NotFoundException(`BatchDeviation not found: ${id}`);
    }
    return deviation;
  }
}
