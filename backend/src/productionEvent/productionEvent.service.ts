import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClsService } from "nestjs-cls";
import {
  EnumProductionEventType,
  EnumProductionEventCategory,
  EnumEventSeverity,
  EnumProductionPhase,
  ProductionEvent,
} from "@prisma/client";
import { LogEventInput } from "./dto/log-event.input";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";

@Injectable()
export class ProductionEventService {
  private readonly logger = new Logger(ProductionEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly mqttDomainPublisher: MqttDomainPublisherService
  ) {}

  private getCurrentUser(): string {
    return this.cls.get("userId") || "system";
  }

  async logEvent(input: LogEventInput): Promise<ProductionEvent> {
    const userId = this.getCurrentUser();

    const event = await this.prisma.productionEvent.create({
      data: {
        batchId: input.batchId,
        eventType: input.eventType,
        eventCategory: input.eventCategory,
        severity: input.severity || EnumEventSeverity.Info,
        title: input.title,
        description: input.description,
        phase: input.phase,
        operationName: input.operationName,
        stepIndex: input.stepIndex,
        branchIndex: input.branchIndex,
        assetId: input.assetId,
        previousState: input.previousState,
        newState: input.newState,
        parameterName: input.parameterName,
        previousValue: input.previousValue,
        newValue: input.newValue,
        units: input.units,
        conditionId: input.conditionId,
        originalCondition: input.originalCondition,
        overrideValue: input.overrideValue,
        initiatedBy: input.initiatedBy || userId,
        metadata: input.metadata,
        createdBy: userId,
      },
    });

    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ProductionEvent",
      eventType: input.eventType,
      data: event as any,
      context: {
        severity: input.severity || undefined,
        phase: input.phase || undefined,
        assetId: input.assetId || undefined,
        batchId: input.batchId,
      },
    });

    this.logger.debug(
      `Event logged: ${input.eventType} - ${input.title} for batch ${input.batchId}`
    );

    return event;
  }

  async logPhaseStarted(
    batchId: string,
    phase: string,
    metadata?: { instanceId?: string; scheduleOrderId?: string }
  ): Promise<void> {
    await this.logEvent({
      batchId,
      eventType: EnumProductionEventType.PhaseStarted,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Phase Started: ${phase}`,
      phase: phase as EnumProductionPhase,
      metadata,
    });
  }

  async logPhaseCompleted(
    batchId: string,
    phase: string,
    metadata?: { instanceId?: string; scheduleOrderId?: string }
  ): Promise<void> {
    await this.logEvent({
      batchId,
      eventType: EnumProductionEventType.PhaseCompleted,
      eventCategory: EnumProductionEventCategory.StateChange,
      title: `Phase Completed: ${phase}`,
      phase: phase as EnumProductionPhase,
      metadata,
    });
  }

  async logMaterialConsumed(
    batchId: string,
    itemName: string,
    quantity: number,
    units: string,
    lotNumber?: string,
    phase?: string,
    metadata?: {
      instanceId?: string;
      scheduleOrderId?: string;
      recipeBomItemId?: string;
      recipeBomActualId?: string;
      inventoryId?: string;
    }
  ): Promise<void> {
    await this.logEvent({
      batchId,
      eventType: EnumProductionEventType.MaterialConsumed,
      eventCategory: EnumProductionEventCategory.MaterialTracking,
      title: `Material Consumed: ${itemName}`,
      description: `${quantity} ${units}${
        lotNumber ? ` (Lot: ${lotNumber})` : ""
      }`,
      phase: phase as EnumProductionPhase | undefined,
      units,
      newValue: quantity,
      metadata: { ...metadata, lotNumber },
    });
  }

  async getEventsByBatch(
    batchId: string,
    filter?: {
      eventType?: EnumProductionEventType;
      eventCategory?: EnumProductionEventCategory;
      severity?: EnumEventSeverity;
    }
  ): Promise<ProductionEvent[]> {
    const where: any = { batchId };
    if (filter?.eventType) where.eventType = filter.eventType;
    if (filter?.eventCategory) where.eventCategory = filter.eventCategory;
    if (filter?.severity) where.severity = filter.severity;

    return this.prisma.productionEvent.findMany({
      where,
      orderBy: { occurredAt: "asc" },
    });
  }

  async getBatchTimeline(batchId: string): Promise<ProductionEvent[]> {
    return this.prisma.productionEvent.findMany({
      where: { batchId },
      orderBy: { occurredAt: "asc" },
    });
  }
}
