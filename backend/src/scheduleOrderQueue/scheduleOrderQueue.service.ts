import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderQueueServiceBase } from "./base/scheduleOrderQueue.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import {
  EnumScheduleOrderStatus,
  EnumUnitProcedureName,
  Prisma,
  ScheduleOrderQueue,
  ProductionOrder,
} from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { ScheduleOrderQueueUpdateInput } from "./base/ScheduleOrderQueueUpdateInput";
import { ProductionOrderRecipeInstanceService } from "../productionOrderRecipeInstance/productionOrderRecipeInstance.service";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";

interface ScheduleEstimates {
  mashingDuration: number;
  fermentationDuration: number;
  distillationDuration: number;
  totalDuration: number;
  mashingStartTime?: Date;
  fermentationStartTime?: Date;
  fermentationEndTime?: Date;
  distillationStartTime?: Date;
  distillationEndTime?: Date;
  barrelingStartTime?: Date;
}

interface PrismaError extends Error {
  code?: string;
  meta?: any;
}

@Injectable()
export class ScheduleOrderQueueService extends ScheduleOrderQueueServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly productionOrderRecipeInstanceService: ProductionOrderRecipeInstanceService,
    private readonly scheduleOrderRecipeInstanceService: ScheduleOrderRecipeInstanceService
  ) {
    super(prisma);
  }

  async addToPendingScheduleOrderQueue<
    T extends Prisma.ScheduleOrderQueueCreateArgs
  >(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueCreateArgs>
  ): Promise<ScheduleOrderQueue> {
    /*
        The only arg needed for this is the id of the scheduleOrder

        This will add the SchO to the end of the queue (ie max int) and set the status to pending
        */

    // get all the max index values for the scheduleOrderQueue
    const maxIndex = await this.prisma.scheduleOrderQueue.aggregate({
      _max: {
        queueIndex: true,
      },
    });

    // increment the max index by 1. If none found, the index is 0
    const newIndex = maxIndex._max.queueIndex
      ? maxIndex._max.queueIndex + 1
      : 0;

    // create the new SchO
    const newScheduleOrderQueue = await super.createScheduleOrderQueue({
      data: {
        ...args.data,
        queueIndex: newIndex,
      },
    });

    return newScheduleOrderQueue;
  }

  async setActiveScheduleOrderQueue<
    T extends Prisma.ScheduleOrderQueueUpdateArgs
  >(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>
  ): Promise<ScheduleOrderQueue> {
    /*
        This will set the 0th index SchO in the queue to -1 and set the status to In Progress. 
        All other index SchOs will be decremented by 1
        */

    // get all the SchOs in the queue
    const scheduleOrderQueues = await this.prisma.scheduleOrderQueue.findMany({
      where: {
        queueIndex: {
          not: null,
        },
      },
      orderBy: {
        queueIndex: "asc",
      },
    });

    // Start a transaction
    return await this.prisma.$transaction(async (prisma) => {
      // decrement all schO queue indexs
      // Update all schedule order queues
      for (const schO of scheduleOrderQueues) {
        const newIndex = schO.queueIndex !== null ? schO.queueIndex - 1 : null;
        await prisma.scheduleOrderQueue.update({
          where: { id: schO.id },
          data: {
            queueIndex: newIndex,
          },
        });
      }

      this.logger.log("Decremented all schedule order queue indexes");

      // Set the schO of interest that just became 0 to be in progress
      const scheduleOrder = await prisma.scheduleOrder.findFirst({
        where: { scheduleOrderQueues: { id: args.where.id } },
      });

      if (!scheduleOrder) {
        throw new Error(`Schedule order not found for queue ${args.where.id}`);
      }

      await prisma.scheduleOrder.update({
        where: { id: scheduleOrder.id },
        data: {
          status: "InProgress",
        },
      });

      // Create ScheduleOrderRecipeInstance when SO becomes active
      // This is the central anchor for tracking actuals during combined execution
      try {
        await this.scheduleOrderRecipeInstanceService.createFromScheduleOrder(
          scheduleOrder.id,
          "System" // Default createdBy for automatic creation
        );
        this.logger.log(
          `Created ScheduleOrderRecipeInstance for schedule order ${scheduleOrder.id} (now active at position 0)`
        );
      } catch (error) {
        this.logger.error(
          `Failed to create ScheduleOrderRecipeInstance for schedule order ${
            scheduleOrder.id
          }: ${error instanceof Error ? error.message : String(error)}`
        );
        // Don't throw - the SO can still be activated, recipe instance can be created later if needed
      }

      // Validate that the schedule order of interest has an index of 0
      const updatedScheduleOrderQueue =
        await prisma.scheduleOrderQueue.findUnique({
          where: { id: args.where.id },
        });

      if (
        !updatedScheduleOrderQueue ||
        updatedScheduleOrderQueue.queueIndex !== 0
      ) {
        this.logger.error(
          `Failed to set active schedule order queue. Expected queue index 0, but got ${updatedScheduleOrderQueue?.queueIndex}`
        );
        throw new Error(
          `Failed to set active schedule order queue. Expected queue index 0, but got ${updatedScheduleOrderQueue?.queueIndex}`
        );
      }
      this.logger.log(
        `Set schedule order ${args.where.id} as active with queue index 0`
      );

      // Check for any queue items that are now at position 1 and trigger production order recipe instance creation
      const queueItemAtPosition1 = await prisma.scheduleOrderQueue.findFirst({
        where: {
          queueIndex: 1,
        },
        include: {
          scheduleOrder: {
            include: {
              productionOrders: true,
            },
          },
        },
      });

      if (queueItemAtPosition1) {
        try {
          // Create production order recipe instance for the item at position 1
          const productionOrderRecipeInstance =
            await this.productionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue(
              queueItemAtPosition1.id,
              "System" // Default createdBy value for automatic creation
            );

          this.logger.log(
            `Automatically created production order recipe instance ${productionOrderRecipeInstance.id} for schedule order queue ${queueItemAtPosition1.id} at position 1`
          );
        } catch (error) {
          this.logger.error(
            `Failed to automatically create production order recipe instance for schedule order queue ${
              queueItemAtPosition1.id
            } at position 1: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          // Don't throw the error to avoid breaking the main flow
        }
      }

      return updatedScheduleOrderQueue;
    });
  }

  async updateScheduleOrderQueueUnitProcedure<
    T extends Prisma.ScheduleOrderQueueUpdateArgs
  >(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>
  ): Promise<ScheduleOrderQueue> {
    /*
        This will simply update the areas field for a given SchO
        */

    return await super.updateScheduleOrderQueue(args);
  }

  async updateScheduleOrderQueueIndex<
    T extends Prisma.ScheduleOrderQueueUpdateArgs
  >(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>,
    newIndex: number
  ): Promise<ScheduleOrderQueue> {
    /**
     * Updates the queue index of a schedule order queue item to a new position.
     *
     * This method handles the complex task of reordering queue items while maintaining
     * data integrity and handling concurrent modifications. Key improvements include:
     *
     * 1. Enhanced Input Validation: Validates inputs outside the transaction to reduce lock time
     * 2. Swap-Based Logic: Uses a 4-step process to avoid unique constraint violations:
     *    - Find item at target position
     *    - Temporarily null the moving item's index
     *    - Swap or shift items as needed
     *    - Set the moving item to its final position
     * 3. Retry Logic: Implements exponential backoff retry for transient failures
     * 4. Better Error Handling: Provides user-friendly error messages for different failure scenarios
     * 5. Transaction Optimization: Uses ReadCommitted isolation level and proper timeouts
     *
     * @param args - Prisma update arguments containing the where clause with the item ID
     * @param newIndex - The new queue position (must be >= 1)
     * @returns Promise<ScheduleOrderQueue> - The updated schedule order queue item
     * @throws Error with user-friendly message for various failure scenarios
     */

    // Validate inputs
    if (!args.where?.id) {
      throw new Error("Schedule order queue ID is required");
    }

    if (newIndex < 1) {
      throw new Error("Queue index must be greater than 0");
    }

    // First, validate that the schedule order queue exists and get its current state
    // This is done outside the transaction to reduce transaction time
    const currentSchO = await this.prisma.scheduleOrderQueue.findUnique({
      where: { id: args.where.id },
      select: {
        id: true,
        queueIndex: true,
      },
    });

    if (!currentSchO) {
      throw new Error(
        `Schedule order queue with id ${args.where.id} not found`
      );
    }

    const currentIndex = currentSchO.queueIndex;
    if (currentIndex === null) {
      throw new Error(
        `Schedule order queue with id ${args.where.id} does not have a valid queue index`
      );
    }

    // If the new index is the same as the current index, no need to update
    if (currentIndex === newIndex) {
      return currentSchO as ScheduleOrderQueue;
    }

    // Get the current max index to validate range
    const maxIndexResult = await this.prisma.scheduleOrderQueue.aggregate({
      _max: {
        queueIndex: true,
      },
      where: {
        queueIndex: {
          not: null,
        },
      },
    });

    const maxIndex = maxIndexResult._max.queueIndex || 0;

    // Validate that newIndex is within valid range
    if (newIndex > maxIndex + 1) {
      throw new Error(
        `New index ${newIndex} is beyond the valid range (max: ${maxIndex + 1})`
      );
    }

    // Start a transaction with improved error handling and retry logic
    const maxRetries = 3;
    let lastError: PrismaError | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.prisma.$transaction(
          async (prisma) => {
            // Step 1: Find the item currently at the target newIndex (if any)
            const itemAtNewIndex = await prisma.scheduleOrderQueue.findFirst({
              where: {
                queueIndex: newIndex,
                id: {
                  not: args.where.id, // Exclude the item being moved
                },
              },
            });

            // Step 2: Temporarily set the moving item's index to null to avoid conflicts
            await prisma.scheduleOrderQueue.update({
              where: { id: args.where.id },
              data: { queueIndex: null },
            });

            // Step 3: If there's an item at the target position, move it to the old position
            if (itemAtNewIndex) {
              await prisma.scheduleOrderQueue.update({
                where: { id: itemAtNewIndex.id },
                data: { queueIndex: currentIndex },
              });
            } else {
              // If no item at target position, we need to shift items to fill the gap
              if (newIndex > currentIndex) {
                // Moving down: shift items between currentIndex+1 and newIndex up by 1
                await prisma.scheduleOrderQueue.updateMany({
                  where: {
                    queueIndex: {
                      gt: currentIndex,
                      lte: newIndex,
                    },
                  },
                  data: {
                    queueIndex: {
                      decrement: 1,
                    },
                  },
                });
              } else {
                // Moving up: shift items between newIndex and currentIndex-1 down by 1
                await prisma.scheduleOrderQueue.updateMany({
                  where: {
                    queueIndex: {
                      gte: newIndex,
                      lt: currentIndex,
                    },
                  },
                  data: {
                    queueIndex: {
                      increment: 1,
                    },
                  },
                });
              }
            }

            // Step 4: Finally, set the moving item to its new position
            const updatedScheduleOrderQueue =
              await prisma.scheduleOrderQueue.update({
                where: { id: args.where.id },
                data: { queueIndex: newIndex },
              });

            this.logger.log(
              `Updated schedule order queue ${
                args.where.id
              } from index ${currentIndex} to ${newIndex} (attempt ${attempt})${
                itemAtNewIndex
                  ? ` - swapped with item ${itemAtNewIndex.id}`
                  : " - shifted other items"
              }`
            );

            return updatedScheduleOrderQueue;
          },
          {
            // Add transaction options for better reliability
            maxWait: 5000, // 5 seconds
            timeout: 10000, // 10 seconds
            isolationLevel: "ReadCommitted", // Use a less restrictive isolation level
          }
        );

        // If we get here, the transaction succeeded
        // After updating queue positions, check for position 1 items
        try {
          await this.monitorQueuePositions();
        } catch (monitorError) {
          // Log but don't fail the main operation if monitoring fails
          this.logger.warn(
            `Queue position monitoring failed after index update: ${
              monitorError instanceof Error
                ? monitorError.message
                : String(monitorError)
            }`
          );
        }

        return result;
      } catch (error) {
        lastError = error as PrismaError;

        this.logger.warn(
          `Attempt ${attempt}/${maxRetries} failed for schedule order queue index update ${args.where.id}: ${lastError.message}`
        );

        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(lastError);

        if (!isRetryable || attempt === maxRetries) {
          // Don't retry for non-retryable errors or if we've exhausted retries
          break;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // If we get here, all retries failed
    this.logger.error(
      `Failed to update schedule order queue index for ${args.where.id} after ${maxRetries} attempts: ${lastError?.message}`,
      lastError?.stack
    );

    // Provide user-friendly error messages based on error type
    if (lastError?.code === "P2002") {
      throw new Error(
        `Unique constraint violation: Another item may already exist at index ${newIndex}. Please refresh and try again.`
      );
    } else if (lastError?.code === "25P02") {
      throw new Error(
        `The operation was interrupted due to concurrent changes. Please refresh the page and try again.`
      );
    } else if (lastError?.code === "P2025") {
      throw new Error(
        `The schedule order queue item was not found. It may have been deleted by another user.`
      );
    } else {
      throw new Error(
        `Failed to update queue index: ${
          lastError?.message || "Unknown error occurred"
        }`
      );
    }
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: PrismaError): boolean {
    const retryableCodes = [
      "25P02", // current transaction is aborted
      "P2034", // Transaction failed due to a write conflict or a deadlock
      "40001", // serialization_failure
      "40P01", // deadlock_detected
    ];

    return (
      retryableCodes.includes(error.code || "") ||
      error.message.includes("deadlock") ||
      error.message.includes("write conflict") ||
      error.message.includes("transaction")
    );
  }

  async completeScheduleOrderQueue<
    T extends Prisma.ScheduleOrderQueueUpdateArgs
  >(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>
  ): Promise<ScheduleOrderQueue> {
    /*
        This will remove the SchO from the queue and set the status to completed
        */

    return await this.prisma.$transaction(async (prisma) => {
      // Find the schedule order queue to be completed
      const scheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
        where: { id: args.where.id },
        include: { scheduleOrder: true },
      });

      if (!scheduleOrderQueue) {
        throw new Error(
          `Schedule order queue with id ${args.where.id} not found`
        );
      }

      // Remove the schedule order from the queue
      await prisma.scheduleOrderQueue.delete({
        where: { id: args.where.id },
      });

      // Update the status of the associated schedule order to 'Complete'
      await prisma.scheduleOrder.update({
        where: { id: scheduleOrderQueue.scheduleOrder?.id },
        data: { status: "Complete" },
      });

      this.logger.log(
        `Completed schedule order ${scheduleOrderQueue.scheduleOrder?.id} and removed from queue`
      );

      // Return the completed schedule order queue
      return scheduleOrderQueue;
    });
  }

  async deactivateScheduleOrderQueue<
    T extends Prisma.ScheduleOrderQueueUpdateArgs
  >(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>
  ): Promise<ScheduleOrderQueue> {
    /*
        This will remove the SchO from the queue and set the status to deactivated
        */

    return await this.prisma.$transaction(async (prisma) => {
      // Find the schedule order queue to be deactivated
      const scheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
        where: { id: args.where.id },
        include: { scheduleOrder: true },
      });

      if (!scheduleOrderQueue) {
        throw new Error(
          `Schedule order queue with id ${args.where.id} not found`
        );
      }

      if (
        scheduleOrderQueue.queueIndex === null ||
        scheduleOrderQueue.queueIndex <= 1
      ) {
        throw new Error(
          `Cannot deactivate schedule order queue with index ${scheduleOrderQueue.queueIndex}. Index must be greater than 1`
        );
      }

      // Remove the schedule order from the queue
      await prisma.scheduleOrderQueue.delete({
        where: { id: args.where.id },
      });

      // Update the status of the associated schedule order to 'Deactivated'
      await prisma.scheduleOrder.update({
        where: { id: scheduleOrderQueue.scheduleOrder?.id },
        data: { status: EnumScheduleOrderStatus.Created }, // TODO: Change this to EnumScheduleOrderStatus.Inactive
      });

      this.logger.log(
        `Deactivated schedule order ${scheduleOrderQueue.scheduleOrder?.id} and removed from queue`
      );

      // Shift down the indices of all schedule order queues with higher indices
      await prisma.scheduleOrderQueue.updateMany({
        where: {
          queueIndex: {
            gt: scheduleOrderQueue.queueIndex,
          },
        },
        data: {
          queueIndex: {
            decrement: 1,
          },
        },
      });

      // Return the deactivated schedule order queue
      return scheduleOrderQueue;
    });
  }

  /**
   * Calculates schedule order estimates based on production order details
   * @param productionOrder The production order to calculate estimates for
   * @param startDate Optional start date for scheduling
   * @returns Object containing all duration and timing estimates
   */
  calculateScheduleOrderEstimates(
    productionOrder: ProductionOrder & {
      recipe?: { totalCooks?: number | null } | null;
    },
    startDate?: Date
  ): ScheduleEstimates {
    // TODO: These fields moved from ProductionOrder to ScheduleOrder
    // Get totalCooks from the related Recipe if available
    const numberOfCooks = productionOrder.recipe?.totalCooks || 1;

    // Calculate mashing duration - 2 hours per cook
    const mashingDuration = numberOfCooks * 2;

    // Calculate fermentation duration - 72 hours plus mashing duration
    const fermentationDuration = 72 + mashingDuration;

    // Distillation duration is the same as fermentation duration
    const distillationDuration = fermentationDuration;

    // Calculate total duration
    const totalDuration = fermentationDuration;

    // Calculate timing estimates if start date is provided
    let mashingStartTime;
    let fermentationStartTime;
    let fermentationEndTime;
    let distillationStartTime;
    let distillationEndTime;
    let barrelingStartTime;

    if (startDate) {
      // Mashing starts at the provided start date
      mashingStartTime = new Date(startDate);

      // Fermentation starts after first mash (2 hours)
      fermentationStartTime = new Date(startDate);
      fermentationStartTime.setHours(fermentationStartTime.getHours() + 2);

      // Fermentation ends after fermentation duration from fermentation start
      fermentationEndTime = new Date(fermentationStartTime);
      fermentationEndTime.setHours(
        fermentationEndTime.getHours() + fermentationDuration
      );

      // Distillation starts after fermentation ends
      distillationStartTime = new Date(fermentationEndTime);

      // Distillation ends after distillation duration
      distillationEndTime = new Date(distillationStartTime);
      distillationEndTime.setHours(
        distillationEndTime.getHours() + distillationDuration
      );

      // Barreling starts right after distillation
      barrelingStartTime = new Date(distillationEndTime);
    }

    return {
      mashingDuration,
      fermentationDuration,
      distillationDuration,
      totalDuration,
      mashingStartTime,
      fermentationStartTime,
      fermentationEndTime,
      distillationStartTime,
      distillationEndTime,
      barrelingStartTime,
    };
  }

  async createAndQueueScheduleOrder(
    productionOrderId: string,
    createdBy: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ScheduleOrderQueue> {
    return await this.prisma.$transaction(async (prisma) => {
      // Find the production order
      const productionOrder = await prisma.productionOrder.findUnique({
        where: { id: productionOrderId },
        include: {
          recipe: { include: { recipeGroup: true } },
        },
      });

      if (!productionOrder) {
        throw new Error(
          `Production order with id ${productionOrderId} not found`
        );
      }

      // TODO: These fields moved from ProductionOrder to ScheduleOrder
      // Need to determine where to get these estimated values from (Recipe? Parameters?)
      const bblPerFerm = undefined; // productionOrder.estimatedBarrelsPerFermenter;
      const yieldPgPerBsh = undefined; // productionOrder.estimatedPGsPerBushel;
      const pgsPerBbl = undefined; // productionOrder.estimatedPGsPerBbl;

      try {
        // Update the production order with scheduling fields
        const updateData: any = {
          // Set the scheduled flag to true
          scheduled: true,
          // Update the status to reflect that it's now scheduled
          status: "Committed",
        };

        // Add optional scheduling parameters if provided
        if (startDate) updateData.startDate = startDate;
        if (endDate) updateData.endDate = endDate;

        // Update the production order with all the scheduling data
        const updatedProductionOrder = await prisma.productionOrder.update({
          where: { id: productionOrderId },
          data: updateData,
        });

        this.logger.log(
          `Updated production order ${productionOrderId} with scheduling information`
        );
      } catch (error) {
        this.logger.error(
          `Failed to update production order ${productionOrderId}: ${error}`
        );
        throw new Error(`Failed to update production order: ${error}`);
      }

      // Calculate schedule estimates using the new method
      const estimates = this.calculateScheduleOrderEstimates(
        productionOrder,
        startDate
      );

      // Calculate total barrels and proof gallons if possible
      let totalProofGallons;

      const totalBarrels = productionOrder.quantity;

      if (pgsPerBbl && totalBarrels) {
        totalProofGallons = pgsPerBbl * totalBarrels;
      }

      // Generate a name for the schedule order
      const today = new Date();
      const year = today.getFullYear().toString().slice(-2);
      const startOfYear = new Date(today.getFullYear(), 0, 0);
      const dayOfYear = Math.floor(
        (today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Get count of orders created today to generate index
      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const ordersToday = await prisma.scheduleOrder.count({
        where: {
          createdAt: {
            gte: todayStart,
          },
        },
      });

      const scheduleOrderName = `SHO${year}${dayOfYear
        .toString()
        .padStart(3, "0")}${(ordersToday + 1).toString().padStart(2, "0")}`;

      // Prepare schedule order data with optional recipeGroup
      const scheduleOrderData: any = {
        productionOrders: { connect: { id: productionOrder.id } },
        status: "Scheduled", // Setting appropriate status for schedule order
        productionOrderAllocation: totalBarrels || 0, // Set allocation to total barrels
        recipeName: productionOrder.recipe?.Recipe ?? "", // Adding required field with null check
        name: scheduleOrderName, // Add a name based on the production order
        // Set all the scheduling fields
        estimatedStart: startDate,
        estimatedEnd: endDate,
        // Add phase-specific timing estimates from calculated values
        estimatedMashingStartTime: estimates.mashingStartTime,
        estimatedMashingDuration: estimates.mashingDuration,
        estimatedFermentationStartTime: estimates.fermentationStartTime,
        estimatedFermentationDuration: estimates.fermentationDuration,
        estimatedDistillationStartTime: estimates.distillationStartTime,
        estimatedDistillationDuration: estimates.distillationDuration,
        estimatedBarrelingStartTime: estimates.barrelingStartTime,
        estimatedTotalProductionDuration: estimates.totalDuration,
        // Add totals if calculated
        totalBarrels, // Set total barrels field directly
        totalProofGallons,
        // Set appropriate duration units
        duration: estimates.totalDuration,
        durationUnits: "Hours",
        createdBy: createdBy, // Use the provided createdBy parameter
      };

      // Only connect recipeGroup if it exists
      if (productionOrder.recipe?.recipeGroup?.id) {
        scheduleOrderData.recipeGroup = {
          connect: { id: productionOrder.recipe.recipeGroup.id },
        };
      }

      // Create a new schedule order with comprehensive scheduling information
      const scheduleOrder = await prisma.scheduleOrder.create({
        data: scheduleOrderData,
      });

      // Update production order status to "Committed" to match schedule order "Scheduled" status
      await prisma.productionOrder.update({
        where: { id: productionOrder.id },
        data: { status: "Committed" },
      });

      this.logger.log(
        `Updated ProductionOrder ${productionOrder.id} status to "Committed" after scheduling`
      );

      // Get the last queue position
      const lastQueueItem = await prisma.scheduleOrderQueue.findFirst({
        orderBy: {
          queueIndex: "desc",
        },
      });

      const nextPosition =
        lastQueueItem?.queueIndex != null ? lastQueueItem.queueIndex + 1 : 0;

      // Find the Granary area to assign to the schedule order queue
      const granaryArea = await prisma.asset.findFirst({
        where: {
          name: {
            contains: "Granary",
            mode: "insensitive", // Case-insensitive search
          },
        },
      });

      if (!granaryArea) {
        this.logger.warn(
          `Granary area not found. Schedule order queue ${scheduleOrder.id} will be created without area assignment.`
        );
      } else {
        this.logger.log(
          `Found Granary area ${granaryArea.id} (${granaryArea.name}) for schedule order queue assignment`
        );
      }

      // Add to queue with Granary area assignment
      const scheduleOrderQueue = await prisma.scheduleOrderQueue.create({
        data: {
          createdBy: createdBy, // Use the provided createdBy parameter
          scheduleOrder: { connect: { id: scheduleOrder.id } },
          queueIndex: nextPosition,
          // Connect to Granary area if found
          areas: granaryArea
            ? {
                connect: { id: granaryArea.id },
              }
            : undefined,
        },
        include: {
          scheduleOrder: true,
          areas: true,
        },
      });

      this.logger.log(
        `Created schedule order ${
          scheduleOrder.id
        } with comprehensive scheduling data and added to queue at position ${nextPosition} by user ${createdBy}${
          granaryArea
            ? ` with Granary area assignment (${granaryArea.name})`
            : " without area assignment"
        }`
      );

      return scheduleOrderQueue;
    });
  }

  /**
   * Detects schedule order queues at position 1 and automatically creates production order recipe instances
   * This method can be called independently or as part of queue management operations
   */
  async handlePosition1QueueItems(): Promise<void> {
    try {
      // Find all queue items currently at position 1
      const queueItemsAtPosition1 =
        await this.prisma.scheduleOrderQueue.findMany({
          where: {
            queueIndex: 1,
          },
          include: {
            scheduleOrder: {
              include: {
                productionOrders: true,
              },
            },
          },
        });

      for (const queueItem of queueItemsAtPosition1) {
        try {
          // Check if a production order recipe instance already exists for this queue item
          const existingInstance =
            await this.prisma.productionOrderRecipeInstance.findFirst({
              where: {
                productionOrder: {
                  scheduleOrder: {
                    scheduleOrderQueues: {
                      id: queueItem.id,
                    },
                  },
                },
              },
            });

          if (existingInstance) {
            this.logger.log(
              `Production order recipe instance already exists for schedule order queue ${queueItem.id} at position 1, skipping creation`
            );
            continue;
          }

          // Create production order recipe instance for the item at position 1
          const productionOrderRecipeInstance =
            await this.productionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue(
              queueItem.id,
              "System" // Default createdBy value for automatic creation
            );

          this.logger.log(
            `Automatically created production order recipe instance ${productionOrderRecipeInstance.id} for schedule order queue ${queueItem.id} at position 1`
          );
        } catch (error) {
          this.logger.error(
            `Failed to create production order recipe instance for schedule order queue ${
              queueItem.id
            } at position 1: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          // Continue with other queue items even if one fails
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle position 1 queue items: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Monitors queue position changes and triggers appropriate actions
   * This method can be called after any queue manipulation to ensure position 1 items are handled
   */
  async monitorQueuePositions(): Promise<void> {
    await this.handlePosition1QueueItems();
  }

  /**
   * Starts an order at queue position 1 by:
   * 1. Updating the schedule order status to "InProgress"
   * 2. Moving it to queue position 0 (active position)
   * 3. Handling any existing item at position 0
   *
   * @param queueItemId - The ID of the schedule order queue item to start
   * @param updatedBy - The user ID of who is starting the order
   * @returns The updated schedule order queue item
   */
  async startOrder(
    queueItemId: string,
    updatedBy: string
  ): Promise<ScheduleOrderQueue> {
    return await this.prisma.$transaction(async (prisma) => {
      // Find the queue item
      const queueItem = await prisma.scheduleOrderQueue.findUnique({
        where: { id: queueItemId },
        include: {
          scheduleOrder: true,
        },
      });

      if (!queueItem) {
        throw new Error(
          `Schedule order queue with id ${queueItemId} not found`
        );
      }

      // Validate queue position - must be at position 1 to start
      if (queueItem.queueIndex !== 1) {
        throw new Error(
          `Cannot start order at queue position ${queueItem.queueIndex}. Order must be at queue position 1 to start.`
        );
      }

      if (!queueItem.scheduleOrder) {
        throw new Error(
          `Schedule order not found for queue item ${queueItemId}`
        );
      }

      // Decrement all items at queueIndex <= 0 to make room for the new active item
      // Must update one by one from lowest to highest to avoid unique constraint violations
      const itemsToShift = await prisma.scheduleOrderQueue.findMany({
        where: { queueIndex: { lte: 0 } },
        orderBy: { queueIndex: "asc" }, // Start with lowest (most negative) first
      });

      for (const item of itemsToShift) {
        await prisma.scheduleOrderQueue.update({
          where: { id: item.id },
          data: { queueIndex: (item.queueIndex ?? 0) - 1 },
        });
      }

      if (itemsToShift.length > 0) {
        this.logger.log(
          `Decremented ${itemsToShift.length} queue items with queueIndex <= 0`
        );
      }

      // Update schedule order status to InProgress
      await prisma.scheduleOrder.update({
        where: { id: queueItem.scheduleOrder.id },
        data: {
          status: EnumScheduleOrderStatus.InProgress,
          updatedBy,
        },
      });

      // Move this item to position 0 (active position)
      await prisma.scheduleOrderQueue.update({
        where: { id: queueItemId },
        data: {
          queueIndex: 0,
          updatedBy,
        },
      });

      // Shift all items with index > 1 down by 1
      // Must update one by one from lowest to highest to avoid unique constraint violations
      const itemsAbove1 = await prisma.scheduleOrderQueue.findMany({
        where: { queueIndex: { gt: 1 } },
        orderBy: { queueIndex: "asc" }, // Start with lowest first (e.g., 2, 3, 4...)
      });

      for (const item of itemsAbove1) {
        await prisma.scheduleOrderQueue.update({
          where: { id: item.id },
          data: { queueIndex: (item.queueIndex ?? 2) - 1 },
        });
      }

      this.logger.log(
        `Started order for schedule order queue ${queueItemId}: status set to InProgress, moved to position 0`
      );

      // Return the updated queue item
      const updatedQueueItem = await prisma.scheduleOrderQueue.findUnique({
        where: { id: queueItemId },
        include: {
          scheduleOrder: true,
        },
      });

      if (!updatedQueueItem) {
        throw new Error(`Failed to retrieve updated queue item ${queueItemId}`);
      }

      return updatedQueueItem;
    });
  }
}
