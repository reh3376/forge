import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderServiceBase } from "./base/scheduleOrder.service.base";
import { Prisma, ScheduleOrder, AuditAction } from "@prisma/client";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import {
  OrderValidationService,
  ScheduleOrderValidationData,
} from "../order-validation/order-validation.service";
import { BomCalculationService } from "../recipeBom/bom-calculation.service";
import { AuditService } from "../audit/audit.service";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";
import {
  RecordCookCompleteInput,
  CookCompleteResponse,
  RecordRecipeLoadedInput,
  RecipeLoadedResponse,
  AdvanceScheduleOrderQueueInput,
  AdvanceQueueResponse,
  QueueStateEntry,
} from "./dto/cook-complete.input";

@Injectable()
export class ScheduleOrderService extends ScheduleOrderServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly orderValidationService: OrderValidationService,
    private readonly bomCalculationService: BomCalculationService,
    private readonly auditService: AuditService,
    private readonly mqttDomainPublisher: MqttDomainPublisherService
  ) {
    super(prisma);
  }

  async createScheduleOrder<T extends Prisma.ScheduleOrderCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderCreateArgs>
  ): Promise<ScheduleOrder> {
    // Validate schedule order data before creation
    await this.validateScheduleOrderData(args.data);

    const scheduleOrder = await super.createScheduleOrder({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        recipeGroup: true,
        scheduleOrderQueues: true,
        productionOrders: true,
        scheduleOrderRecipe: {
          include: {
            recipeBoms: {
              include: {
                recipeBomITem: {
                  include: { item: true },
                },
              },
            },
          },
        },
      },
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "create",
        data: scheduleOrder,
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "create",
      data: scheduleOrder as any,
    });
    this.logger.log(
      `Updated ScheduleOrder: ${scheduleOrder.id} & pushed to topic`
    );
    return scheduleOrder;
  }

  async updateScheduleOrder(
    args: Prisma.ScheduleOrderUpdateArgs
  ): Promise<ScheduleOrder> {
    this.logger.log(
      `Updating ScheduleOrder: ${args.where.id} for data ${JSON.stringify(
        args.data
      )}`
    );
    try {
      // First, get the current schedule order to check for changes
      const currentScheduleOrder = await this.prisma.scheduleOrder.findUnique({
        where: args.where,
        include: {
          productionOrders: true,
        },
      });

      if (!currentScheduleOrder) {
        throw new Error(`ScheduleOrder with ID ${args.where.id} not found`);
      }

      // Update the schedule order with the provided data
      const scheduleOrder = await super.updateScheduleOrder({
        data: args.data,
        where: args.where,
        include: {
          recipeGroup: true,
          scheduleOrderQueues: true,
          productionOrders: true,
        },
      });

      // Check if any scheduling-related fields were updated
      const schedulingFieldsUpdated =
        args.data.estimatedStart !== undefined ||
        args.data.estimatedEnd !== undefined ||
        args.data.estimatedMashingStartTime !== undefined ||
        args.data.estimatedFermentationStartTime !== undefined ||
        args.data.estimatedDistillationStartTime !== undefined ||
        args.data.status !== undefined;

      // If scheduling fields were updated, also update the associated production orders
      if (
        schedulingFieldsUpdated &&
        currentScheduleOrder.productionOrders.length > 0
      ) {
        this.logger.log(
          `Updating ${currentScheduleOrder.productionOrders.length} production orders with scheduling changes`
        );

        // For each production order, update with the scheduling information
        for (const productionOrder of currentScheduleOrder.productionOrders) {
          const updateData: any = {};

          // Map schedule order fields to production order fields
          if (args.data.estimatedStart !== undefined) {
            updateData.startDate = args.data.estimatedStart;
          }

          if (args.data.estimatedEnd !== undefined) {
            updateData.endDate = args.data.estimatedEnd;
          }

          // Update status based on schedule order status changes
          if (args.data.status !== undefined) {
            switch (args.data.status) {
              case "Scheduled":
                updateData.status = "Committed";
                break;
              case "InProgress":
                updateData.status = "InProgress";
                break;
              case "Complete":
                updateData.status = "Complete";
                break;
              default:
                // Keep current status
                break;
            }
          }

          // Only update if there are changes
          if (Object.keys(updateData).length > 0) {
            await this.prisma.productionOrder.update({
              where: { id: productionOrder.id },
              data: updateData,
            });

            this.logger.log(
              `Updated ProductionOrder: ${productionOrder.id} with scheduling changes`
            );
          }
        }
      }

      this.logger.log(
        `Updated ScheduleOrder: ${args.where.id} & pushed to topic`
      );
      await this.rabbitProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
        {
          recordName: "ScheduleOrder",
          event_type: "update",
          data: args.data,
        }
      );
      this.mqttDomainPublisher.publishDomainEvent({
        entityType: "ScheduleOrder",
        eventType: "update",
        data: scheduleOrder as any,
      });
      this.logger.log(
        `Updated ScheduleOrder: ${args.where.id} & pushed to topic`
      );
      return scheduleOrder;
    } catch (error: unknown) {
      this.logger.error(
        `Error updating ScheduleOrder: ${args.where.id} & pushed to topic: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async deleteScheduleOrder<T extends Prisma.ScheduleOrderDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderDeleteArgs>
  ): Promise<ScheduleOrder> {
    const scheduleOrder = await super.deleteScheduleOrder({
      where: args.where,
      include: {
        ...args.include,
        recipeGroup: true,
        scheduleOrderQueues: true,
        productionOrders: true,
      },
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "delete",
        data: scheduleOrder,
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "delete",
      data: scheduleOrder as any,
    });
    this.logger.log(
      `Deleted ScheduleOrder: ${scheduleOrder.id} & pushed to topic`
    );
    return scheduleOrder;
  }

  /**
   * Deschedule and delete a Schedule Order from the queue
   * - Validates that queue index > 0 (prevents deletion of currently running order)
   * - Unlinks ProductionOrders and marks them as available for rescheduling
   * - Deletes ScheduleOrderRecipeInstance if it exists
   * - Removes from queue and resequences subsequent orders
   * - Emits RabbitMQ event for audit trail
   */
  async descheduleScheduleOrder(
    scheduleOrderId: string,
    userId: string
  ): Promise<ScheduleOrder> {
    this.logger.log(
      `Descheduling Schedule Order: ${scheduleOrderId} by user: ${userId}`
    );

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Fetch ScheduleOrder with all relations
        const scheduleOrder = await tx.scheduleOrder.findUnique({
          where: { id: scheduleOrderId },
          include: {
            scheduleOrderQueues: true,
            productionOrders: true,
            scheduleOrderRecipeInstance: true,
          },
        });

        if (!scheduleOrder) {
          throw new BadRequestException(
            `Schedule Order ${scheduleOrderId} not found`
          );
        }

        // 2. Validate queue index > 0 (prevent deletion of currently running order)
        const queueEntry = scheduleOrder.scheduleOrderQueues;
        if (!queueEntry) {
          throw new BadRequestException(
            `Schedule Order ${scheduleOrderId} is not in the queue`
          );
        }

        if (
          queueEntry.queueIndex === null ||
          queueEntry.queueIndex === undefined
        ) {
          throw new BadRequestException(
            `Schedule Order ${scheduleOrderId} has invalid queue index`
          );
        }

        if (queueEntry.queueIndex === 0) {
          throw new BadRequestException(
            "Cannot delete currently running order (queue index 0). Please complete or deactivate the order first."
          );
        }

        const deletedQueueIndex: number = queueEntry.queueIndex;
        this.logger.log(
          `Deleting Schedule Order at queue index ${deletedQueueIndex}`
        );

        // 3. Unlink ProductionOrders and mark as available for rescheduling
        if (scheduleOrder.productionOrders.length > 0) {
          await tx.productionOrder.updateMany({
            where: { scheduleOrderId },
            data: {
              scheduleOrderId: null,
              scheduled: false,
              status: "Initiated", // Reset to initial state
            },
          });
          this.logger.log(
            `Unlinked ${scheduleOrder.productionOrders.length} production order(s) from Schedule Order ${scheduleOrderId}`
          );
        }

        // 4. Delete ScheduleOrderRecipeInstance if it exists (Prisma cascades related data)
        if (scheduleOrder.scheduleOrderRecipeInstance) {
          await tx.scheduleOrderRecipeInstance.delete({
            where: { id: scheduleOrder.scheduleOrderRecipeInstance.id },
          });
          this.logger.log(
            `Deleted ScheduleOrderRecipeInstance for Schedule Order ${scheduleOrderId}`
          );
        }

        // 5. Delete ScheduleOrderQueue entry
        await tx.scheduleOrderQueue.delete({
          where: { id: queueEntry.id },
        });
        this.logger.log(
          `Deleted queue entry for Schedule Order ${scheduleOrderId}`
        );

        // 6. Delete ScheduleOrder
        const deletedScheduleOrder = await tx.scheduleOrder.delete({
          where: { id: scheduleOrderId },
          include: {
            recipeGroup: true,
            productionOrders: true,
          },
        });

        // 7. Resequence queue (close gaps)
        await tx.scheduleOrderQueue.updateMany({
          where: { queueIndex: { gt: deletedQueueIndex } },
          data: { queueIndex: { decrement: 1 } },
        });
        this.logger.log(
          `Resequenced queue indices after deleting index ${deletedQueueIndex}`
        );

        // 8. Emit RabbitMQ event for audit trail
        await this.rabbitProducer.emitMessage(
          WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
          {
            recordName: "ScheduleOrder",
            event_type: "deschedule",
            data: {
              scheduleOrderId,
              userId,
              queueIndex: deletedQueueIndex,
              unlinkedProductionOrders: scheduleOrder.productionOrders.length,
            },
          }
        );
        this.mqttDomainPublisher.publishDomainEvent({
          entityType: "ScheduleOrder",
          eventType: "deschedule",
          data: { id: scheduleOrderId, userId, queueIndex: deletedQueueIndex },
          context: { scheduleOrderId },
        });

        this.logger.log(
          `Successfully descheduled Schedule Order: ${scheduleOrderId} & pushed to topic`
        );

        return deletedScheduleOrder;
      },
      {
        timeout: 30000, // 30 second timeout for transaction
      }
    );
  }

  /**
   * Validates schedule order data before creation using the OrderValidationService
   */
  private async validateScheduleOrderData(
    data:
      | Prisma.ScheduleOrderCreateInput
      | Prisma.ScheduleOrderUncheckedCreateInput
  ): Promise<void> {
    // Type guard to check if it's a CreateInput (with relations) vs UncheckedCreateInput (with IDs)
    const isCreateInput = (d: any): d is Prisma.ScheduleOrderCreateInput => {
      return d.recipeGroup && (d.recipeGroup.connect || d.recipeGroup.create);
    };

    let recipeGroupId: string | undefined;
    let scheduleOrderRecipeId: string | undefined;

    if (isCreateInput(data)) {
      // Handle ScheduleOrderCreateInput
      recipeGroupId = data.recipeGroup?.connect?.id;
      scheduleOrderRecipeId = data.scheduleOrderRecipe?.connect?.id;

      // Skip validation if creating new objects
      if (data.recipeGroup?.create) {
        this.logger.log(
          "Skipping validation for creation with new recipe group"
        );
        return;
      }
    } else {
      // Handle ScheduleOrderUncheckedCreateInput
      recipeGroupId = (data as Prisma.ScheduleOrderUncheckedCreateInput)
        .recipeGroupId;
      scheduleOrderRecipeId =
        (data as Prisma.ScheduleOrderUncheckedCreateInput)
          .scheduleOrderRecipeId || undefined;
    }

    // Ensure we have required data for validation
    if (!recipeGroupId) {
      throw new BadRequestException(
        "Recipe group is required for schedule order validation"
      );
    }

    const validationData: ScheduleOrderValidationData = {
      recipeGroup: { id: recipeGroupId },
      scheduleOrderRecipe: scheduleOrderRecipeId
        ? { id: scheduleOrderRecipeId }
        : undefined,
      productionOrders: undefined, // Production orders are typically added after schedule order creation
    };

    // Validate that recipeGroup is provided
    if (!validationData.recipeGroup.id) {
      throw new Error("Recipe group is required for Schedule Order");
    }

    // Call the validation service
    await this.orderValidationService.validateScheduleOrder(validationData);
  }

  /**
   * Updates production execution tracking for a Schedule Order
   * These fields were moved from ProductionOrder to ScheduleOrder for Many:1 relationship
   */
  async updateProductionExecution(
    scheduleOrderId: string,
    executionData: {
      executedCooks?: number;
      executedFermenters?: number;
      completedCooks?: number;
      completedFermenters?: number;
      actualStart?: Date;
      actualEnd?: Date;
    }
  ): Promise<ScheduleOrder> {
    this.logger.log(
      `Updating production execution for Schedule Order: ${scheduleOrderId}`
    );

    // Get current schedule order to validate update
    const currentScheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: { productionOrders: true },
    });

    if (!currentScheduleOrder) {
      throw new BadRequestException(
        `Schedule Order ${scheduleOrderId} not found`
      );
    }

    // Update execution fields
    const scheduleOrder = await this.prisma.scheduleOrder.update({
      where: { id: scheduleOrderId },
      data: {
        executedCooks: executionData.executedCooks,
        executedFermenters: executionData.executedFermenters,
        completedCooks: executionData.completedCooks,
        completedFermenters: executionData.completedFermenters,
        actualStart: executionData.actualStart,
        actualEnd: executionData.actualEnd,
      },
      include: {
        recipeGroup: true,
        productionOrders: true,
      },
    });

    // Emit update message
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "execution_update",
        data: {
          scheduleOrderId,
          executionData,
          productionOrders: currentScheduleOrder.productionOrders.length,
        },
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "execution_update",
      data: { id: scheduleOrderId, ...executionData },
      context: { scheduleOrderId },
    });

    this.logger.log(
      `Updated production execution for Schedule Order: ${scheduleOrderId}`
    );
    return scheduleOrder;
  }

  /**
   * Tracks cook execution progress
   */
  async recordCookExecution(
    scheduleOrderId: string,
    cooksCompleted: number
  ): Promise<ScheduleOrder> {
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      select: { executedCooks: true, completedCooks: true, totalCooks: true },
    });

    if (!scheduleOrder) {
      throw new BadRequestException(
        `Schedule Order ${scheduleOrderId} not found`
      );
    }

    const newExecutedCooks =
      (scheduleOrder.executedCooks || 0) + cooksCompleted;
    const newCompletedCooks = Math.max(
      newExecutedCooks,
      scheduleOrder.completedCooks || 0
    );

    return this.updateProductionExecution(scheduleOrderId, {
      executedCooks: newExecutedCooks,
      completedCooks: newCompletedCooks,
    });
  }

  /**
   * Tracks fermenter execution progress
   */
  async recordFermenterExecution(
    scheduleOrderId: string,
    fermentersCompleted: number
  ): Promise<ScheduleOrder> {
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      select: {
        executedFermenters: true,
        completedFermenters: true,
        totalFermenters: true,
      },
    });

    if (!scheduleOrder) {
      throw new BadRequestException(
        `Schedule Order ${scheduleOrderId} not found`
      );
    }

    const newExecutedFermenters =
      (scheduleOrder.executedFermenters || 0) + fermentersCompleted;
    const newCompletedFermenters = Math.max(
      newExecutedFermenters,
      scheduleOrder.completedFermenters || 0
    );

    return this.updateProductionExecution(scheduleOrderId, {
      executedFermenters: newExecutedFermenters,
      completedFermenters: newCompletedFermenters,
    });
  }

  /**
   * Gets production execution status for a Schedule Order
   */
  async getProductionExecutionStatus(scheduleOrderId: string): Promise<{
    scheduleOrderId: string;
    totalCooks: number | null;
    executedCooks: number | null;
    completedCooks: number | null;
    totalFermenters: number | null;
    executedFermenters: number | null;
    completedFermenters: number | null;
    cookProgress: number; // Percentage
    fermenterProgress: number; // Percentage
    overallProgress: number; // Percentage
    productionOrderCount: number;
  }> {
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        productionOrders: {
          select: { id: true },
        },
      },
    });

    if (!scheduleOrder) {
      throw new BadRequestException(
        `Schedule Order ${scheduleOrderId} not found`
      );
    }

    const totalCooks = scheduleOrder.totalCooks || 0;
    const executedCooks = scheduleOrder.executedCooks || 0;
    const completedCooks = scheduleOrder.completedCooks || 0;
    const totalFermenters = scheduleOrder.totalFermenters || 0;
    const executedFermenters = scheduleOrder.executedFermenters || 0;
    const completedFermenters = scheduleOrder.completedFermenters || 0;

    const cookProgress =
      totalCooks > 0 ? (completedCooks / totalCooks) * 100 : 0;
    const fermenterProgress =
      totalFermenters > 0 ? (completedFermenters / totalFermenters) * 100 : 0;
    const overallProgress = (cookProgress + fermenterProgress) / 2;

    return {
      scheduleOrderId,
      totalCooks,
      executedCooks,
      completedCooks,
      totalFermenters,
      executedFermenters,
      completedFermenters,
      cookProgress: Math.round(cookProgress),
      fermenterProgress: Math.round(fermenterProgress),
      overallProgress: Math.round(overallProgress),
      productionOrderCount: scheduleOrder.productionOrders.length,
    };
  }

  /**
   * Creates a Schedule Order Queue entry for production scheduling
   */
  async createScheduleOrderQueue(
    scheduleOrderId: string,
    areaIds?: string[]
  ): Promise<import(".prisma/client").ScheduleOrderQueue> {
    const maxQueueIndex = await this.prisma.scheduleOrderQueue.findFirst({
      where: { queueIndex: { not: null } },
      orderBy: { queueIndex: "desc" },
      select: { queueIndex: true },
    });

    const newQueueIndex = (maxQueueIndex?.queueIndex ?? 0) + 1;

    const queueData: any = {
      scheduleOrder: { connect: { id: scheduleOrderId } },
      queueIndex: newQueueIndex,
      createdBy: "system", // TODO: Get from context
    };

    // Connect areas if provided
    if (areaIds && areaIds.length > 0) {
      queueData.areas = {
        connect: areaIds.map((id) => ({ id })),
      };
    }

    const queueEntry = await this.prisma.scheduleOrderQueue.create({
      data: queueData,
      include: {
        scheduleOrder: true,
        areas: true,
      },
    });

    this.logger.log(
      `Created Schedule Order Queue entry: ${queueEntry.id} for Schedule Order: ${scheduleOrderId}`
    );
    return queueEntry;
  }

  /**
   * Update grain and water loads for a schedule order and trigger BOM recalculation
   */
  async updateLoads(
    scheduleOrderId: string,
    loads: {
      grainLoad?: number;
      waterLoad?: number;
    },
    userId: string
  ): Promise<ScheduleOrder> {
    this.logger.log(
      `Updating loads for ScheduleOrder ${scheduleOrderId}: grainLoad=${loads.grainLoad}, waterLoad=${loads.waterLoad}`
    );

    // Get the schedule order to retrieve the mash bill from the recipe
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        scheduleOrderRecipe: {
          select: {
            customerCode: true, // Mash bill is stored in customerCode
          },
        },
      },
    });

    if (!scheduleOrder) {
      throw new BadRequestException(
        `ScheduleOrder with ID ${scheduleOrderId} not found`
      );
    }

    // Update the schedule order with new loads
    const updated = await this.prisma.scheduleOrder.update({
      where: { id: scheduleOrderId },
      data: {
        totalGrainWeight: loads.grainLoad,
        totalWaterVolume: loads.waterLoad,
        loadsLastUpdatedAt: new Date(),
        loadsLastUpdatedBy: userId,
      },
      include: {
        scheduleOrderRecipe: true,
        scheduleOrderRecipeInstance: true,
      },
    });

    // Trigger BOM recalculation if there's a recipe instance
    if (updated.scheduleOrderRecipeInstance) {
      await this.bomCalculationService.recalculateOnLoadChange(
        scheduleOrderId,
        {
          grainLoad: updated.totalGrainWeight || 0,
          waterLoad: updated.totalWaterVolume || undefined,
          mashBill: updated.scheduleOrderRecipe?.customerCode || undefined,
          recipeId: updated.scheduleOrderRecipe?.id,
          userId, // For audit tracking
        }
      );

      this.logger.log(
        `Successfully recalculated BOM for ScheduleOrder ${scheduleOrderId}`
      );
    } else {
      this.logger.warn(
        `No recipe instance found for ScheduleOrder ${scheduleOrderId}, BOM recalculation skipped`
      );
    }

    // Emit update message to RabbitMQ
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "update",
        data: updated,
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "loads_update",
      data: updated as any,
      context: { scheduleOrderId },
    });

    this.logger.log(
      `Updated loads for ScheduleOrder ${scheduleOrderId} and pushed to topic`
    );

    return updated;
  }

  /**
   * Record a cook completion from Ignition/PLC
   * - Increments executedCooks on the ScheduleOrder
   * - Creates an audit log record for traceability
   * - Emits RabbitMQ event
   *
   * Called by Ignition when PLC signals cook complete
   */
  async recordCookComplete(
    input: RecordCookCompleteInput
  ): Promise<CookCompleteResponse> {
    this.logger.log(
      `Recording cook complete for ScheduleOrder ${input.scheduleOrderId}: ` +
        `cook ${input.cookIndex} on ${input.cookerNumber}`
    );

    // Get current schedule order state
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: input.scheduleOrderId },
      select: {
        id: true,
        executedCooks: true,
        totalCooks: true,
        status: true,
      },
    });

    if (!scheduleOrder) {
      throw new BadRequestException(
        `ScheduleOrder ${input.scheduleOrderId} not found`
      );
    }

    // Increment executed cooks
    const newExecutedCooks = (scheduleOrder.executedCooks || 0) + 1;
    const allCooksComplete =
      newExecutedCooks >= (scheduleOrder.totalCooks || 0);

    // Update schedule order - use proper enum value
    const updatedScheduleOrder = await this.prisma.scheduleOrder.update({
      where: { id: input.scheduleOrderId },
      data: {
        executedCooks: newExecutedCooks,
        // If all cooks are complete, mark as ready for next phase
        ...(allCooksComplete && { status: "ReadyForSeparation" }),
      },
    });

    // Create audit log for cook completion
    const auditLog = await this.auditService.logChange({
      entityType: "ScheduleOrder",
      entityId: input.scheduleOrderId,
      action: AuditAction.UPDATE,
      oldValues: {
        executedCooks: scheduleOrder.executedCooks,
        status: scheduleOrder.status,
      },
      newValues: {
        executedCooks: newExecutedCooks,
        status: updatedScheduleOrder.status,
        cookCompletion: {
          cookIndex: input.cookIndex,
          cookerNumber: input.cookerNumber,
          completedAt: input.completedAt,
          notes: input.notes,
        },
      },
      userId: input.completedBy || undefined,
    });

    // Emit RabbitMQ event
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "cook_complete",
        data: {
          scheduleOrderId: input.scheduleOrderId,
          cookIndex: input.cookIndex,
          cookerNumber: input.cookerNumber,
          executedCooks: newExecutedCooks,
          totalCooks: scheduleOrder.totalCooks,
          allCooksComplete,
          completedAt: input.completedAt,
          completedBy: input.completedBy,
        },
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: {
        id: input.scheduleOrderId,
        cookIndex: input.cookIndex,
        cookerNumber: input.cookerNumber,
        executedCooks: newExecutedCooks,
        totalCooks: scheduleOrder.totalCooks,
        allCooksComplete,
      },
      context: { scheduleOrderId: input.scheduleOrderId },
    });

    this.logger.log(
      `Cook ${input.cookIndex} recorded for ScheduleOrder ${input.scheduleOrderId}. ` +
        `Progress: ${newExecutedCooks}/${scheduleOrder.totalCooks}`
    );

    return {
      scheduleOrderId: input.scheduleOrderId,
      executedCooks: newExecutedCooks,
      totalCooks: scheduleOrder.totalCooks || 0,
      cookIndex: input.cookIndex,
      cookerNumber: input.cookerNumber,
      allCooksComplete,
      auditLogId: auditLog?.id,
    };
  }

  /**
   * Record that a recipe was loaded to the PLC
   * - Creates an audit log record for traceability
   * - Captures the updatedAt timestamp for change detection
   *
   * Called by Ignition after successfully writing recipe to PLC tags
   */
  async recordRecipeLoadedToPLC(
    input: RecordRecipeLoadedInput
  ): Promise<RecipeLoadedResponse> {
    this.logger.log(
      `Recording recipe load for ScheduleOrder ${input.scheduleOrderId}: ` +
        `instance ${input.scheduleOrderRecipeInstanceId} on ${input.cookerNumber}`
    );

    // Verify the schedule order and recipe instance exist
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: input.scheduleOrderId },
      include: {
        scheduleOrderRecipeInstance: true,
      },
    });

    if (!scheduleOrder) {
      throw new BadRequestException(
        `ScheduleOrder ${input.scheduleOrderId} not found`
      );
    }

    if (!scheduleOrder.scheduleOrderRecipeInstance) {
      throw new BadRequestException(
        `ScheduleOrderRecipeInstance not found for ScheduleOrder ${input.scheduleOrderId}`
      );
    }

    // Get the actual updatedAt from the recipe instance for change detection
    const recipeInstance =
      await this.prisma.scheduleOrderRecipeInstance.findUnique({
        where: { id: input.scheduleOrderRecipeInstanceId },
        select: { updatedAt: true },
      });

    const loadedUpdatedAt =
      recipeInstance?.updatedAt?.toISOString() || new Date().toISOString();

    // Create audit log for recipe load
    const auditLog = await this.auditService.logChange({
      entityType: "ScheduleOrderRecipeInstance",
      entityId: input.scheduleOrderRecipeInstanceId,
      action: AuditAction.UPDATE, // Using UPDATE since we're recording a state change
      oldValues: undefined,
      newValues: {
        event: "RECIPE_LOADED_TO_PLC",
        scheduleOrderId: input.scheduleOrderId,
        cookerNumber: input.cookerNumber,
        loadedAt: input.loadedAt,
        sourceUpdatedAt: input.sourceUpdatedAt,
        actualUpdatedAt: loadedUpdatedAt,
      },
      userId: input.loadedBy || undefined,
    });

    // Emit RabbitMQ event for recipe load
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrderRecipeInstance",
        event_type: "recipe_loaded_to_plc",
        data: {
          scheduleOrderId: input.scheduleOrderId,
          scheduleOrderRecipeInstanceId: input.scheduleOrderRecipeInstanceId,
          cookerNumber: input.cookerNumber,
          loadedAt: input.loadedAt,
          loadedBy: input.loadedBy,
          loadedUpdatedAt,
        },
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "recipe_loaded_to_plc",
      data: {
        id: input.scheduleOrderId,
        scheduleOrderRecipeInstanceId: input.scheduleOrderRecipeInstanceId,
        cookerNumber: input.cookerNumber,
        loadedUpdatedAt,
      },
      context: { scheduleOrderId: input.scheduleOrderId },
    });

    this.logger.log(
      `Recipe load recorded for ScheduleOrder ${input.scheduleOrderId} on ${input.cookerNumber}`
    );

    return {
      scheduleOrderId: input.scheduleOrderId,
      scheduleOrderRecipeInstanceId: input.scheduleOrderRecipeInstanceId,
      cookerNumber: input.cookerNumber,
      auditLogId: auditLog?.id,
      loadedUpdatedAt,
    };
  }

  /**
   * Advance the schedule order queue (changeover)
   * - Marks the current SO (queueIndex 0) as complete
   * - Removes it from the queue
   * - Decrements all remaining queue indices
   * - Returns the new active SO and queue state
   *
   * Called by Ignition when all cooks are complete and changeover is triggered
   */
  async advanceScheduleOrderQueue(
    input: AdvanceScheduleOrderQueueInput
  ): Promise<AdvanceQueueResponse> {
    this.logger.log(
      `Advancing schedule order queue, initiated by: ${input.advancedBy}`
    );

    return await this.prisma.$transaction(
      async (tx) => {
        // Find the current active queue entry (queueIndex 0)
        const currentActive = await tx.scheduleOrderQueue.findFirst({
          where: { queueIndex: 0 },
          include: {
            scheduleOrder: {
              select: {
                id: true,
                name: true,
                status: true,
                executedCooks: true,
                totalCooks: true,
              },
            },
          },
        });

        if (!currentActive) {
          // No active SO, return empty state
          const queueState = await tx.scheduleOrderQueue.findMany({
            where: { queueIndex: { gte: 0 } },
            orderBy: { queueIndex: "asc" },
            include: {
              scheduleOrder: {
                select: { id: true, name: true },
              },
            },
          });

          const auditLog = await this.auditService.logChange({
            entityType: "ScheduleOrderQueue",
            entityId: "queue-advance-no-active",
            action: AuditAction.UPDATE,
            oldValues: undefined,
            newValues: {
              event: "QUEUE_ADVANCE_NO_ACTIVE",
              advancedBy: input.advancedBy,
              notes: input.notes,
            },
            userId: input.advancedBy || undefined,
          });

          return {
            success: false,
            previousSOId: undefined,
            newActiveSOId: undefined,
            newActiveSOName: undefined,
            newQueueState: queueState.map((q) => ({
              queueIndex: q.queueIndex ?? 0,
              scheduleOrderId: q.scheduleOrder?.id || "",
              scheduleOrderName: q.scheduleOrder?.name || undefined,
            })),
            auditLogId: auditLog?.id,
            message: "No active schedule order found at queue index 0",
          };
        }

        const previousSOId = currentActive.scheduleOrder?.id;
        const previousSOName = currentActive.scheduleOrder?.name;

        // Mark the schedule order as complete
        if (previousSOId) {
          await tx.scheduleOrder.update({
            where: { id: previousSOId },
            data: { status: "Complete" },
          });
        }

        // Delete the queue entry
        await tx.scheduleOrderQueue.delete({
          where: { id: currentActive.id },
        });

        // Decrement all remaining queue indices
        await tx.scheduleOrderQueue.updateMany({
          where: { queueIndex: { gt: 0 } },
          data: { queueIndex: { decrement: 1 } },
        });

        // Get the new queue state
        const newQueueState = await tx.scheduleOrderQueue.findMany({
          where: { queueIndex: { gte: 0 } },
          orderBy: { queueIndex: "asc" },
          include: {
            scheduleOrder: {
              select: { id: true, name: true },
            },
          },
        });

        const newActive = newQueueState.find((q) => q.queueIndex === 0);
        const newActiveSOId = newActive?.scheduleOrder?.id;
        const newActiveSOName = newActive?.scheduleOrder?.name || undefined;

        // Create audit log
        const auditLog = await this.auditService.logChange({
          entityType: "ScheduleOrderQueue",
          entityId: previousSOId || "unknown",
          action: AuditAction.UPDATE,
          oldValues: {
            activeScheduleOrderId: previousSOId,
            activeScheduleOrderName: previousSOName,
          },
          newValues: {
            event: "QUEUE_ADVANCED",
            previousScheduleOrderId: previousSOId,
            previousScheduleOrderName: previousSOName,
            newActiveScheduleOrderId: newActiveSOId,
            newActiveScheduleOrderName: newActiveSOName,
            advancedBy: input.advancedBy,
            notes: input.notes,
            newQueueLength: newQueueState.length,
          },
          userId: input.advancedBy || "system",
        });

        // Emit RabbitMQ event
        await this.rabbitProducer.emitMessage(
          WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
          {
            recordName: "ScheduleOrderQueue",
            event_type: "queue_advanced",
            data: {
              previousSOId,
              previousSOName,
              newActiveSOId,
              newActiveSOName,
              advancedBy: input.advancedBy,
              queueLength: newQueueState.length,
            },
          }
        );
        this.mqttDomainPublisher.publishDomainEvent({
          entityType: "ScheduleOrder",
          eventType: "queue_advanced",
          data: {
            id: previousSOId,
            previousSOId,
            newActiveSOId,
            newActiveSOName,
            queueLength: newQueueState.length,
          },
          context: { scheduleOrderId: previousSOId },
        });

        this.logger.log(
          `Queue advanced: ${previousSOName || previousSOId} completed, ` +
            `new active: ${newActiveSOName || newActiveSOId || "none"}`
        );

        return {
          success: true,
          previousSOId,
          newActiveSOId,
          newActiveSOName,
          newQueueState: newQueueState.map((q) => ({
            queueIndex: q.queueIndex ?? 0,
            scheduleOrderId: q.scheduleOrder?.id || "",
            scheduleOrderName: q.scheduleOrder?.name || undefined,
          })),
          auditLogId: auditLog?.id,
        };
      },
      {
        timeout: 30000,
      }
    );
  }
}
