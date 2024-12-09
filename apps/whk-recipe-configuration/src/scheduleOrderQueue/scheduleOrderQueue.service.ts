import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderQueueServiceBase } from "./base/scheduleOrderQueue.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { EnumScheduleOrderStatus, EnumUnitProcedureName, Prisma, ScheduleOrderQueue } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { ScheduleOrderQueueUpdateInput } from "./base/ScheduleOrderQueueUpdateInput";

@Injectable()
export class ScheduleOrderQueueService extends ScheduleOrderQueueServiceBase {
    constructor(
        protected readonly prisma: PrismaService,
        protected readonly rabbitProducer: RabbitMQProducerService,
        @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
    ) {
        super(prisma);
    }

    async addToPendingScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueCreateArgs>): Promise<ScheduleOrderQueue> {
        /*
        The only arg needed for this is the id of the scheduleOrder

        This will add the SchO to the end of the queue (ie max int) and set the status to pending
        */

        // get all the max index values for the scheduleOrderQueue
        const maxIndex = await this.prisma.scheduleOrderQueue.aggregate({
            _max: {
                queueIndex: true
            }
        });

        // increment the max index by 1. If none found, the index is 0
        const newIndex = maxIndex._max.queueIndex ? maxIndex._max.queueIndex + 1 : 0;

        // create the new SchO
        const newScheduleOrderQueue = await super.createScheduleOrderQueue({
            data: {
                ...args.data,
                queueIndex: newIndex,
            }
        });

        return newScheduleOrderQueue;
    }

    async setActiveScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>): Promise<ScheduleOrderQueue> {
        /*
        This will set the 0th index SchO in the queue to -1 and set the status to In Progress. 
        All other index SchOs will be decremented by 1
        */

        // get all the SchOs in the queue
        const scheduleOrderQueues = await this.prisma.scheduleOrderQueue.findMany({
            where: {
                queueIndex: {
                    not: null
                }
            },
            orderBy: {
                queueIndex: 'asc'
            }
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
                    }
                });
            }
            // const updatePromises = scheduleOrderQueues.map((schO, index) => {
            //     const newIndex = index === 0 ? 0 : schO.queueIndex !== null ? schO.queueIndex - 1 : null;
            //     return prisma.scheduleOrderQueue.update({
            //         where: { id: schO.id },
            //         data: {
            //             queueIndex: newIndex,
            //         }
            //     });
            // });

            // // Execute all updates
            // await Promise.all(updatePromises);
            this.logger.log('Decremented all schedule order queue indexes');

            // Set the schO of interest that just became 0 to be in progress
            const scheduleOrder = await prisma.scheduleOrder.findFirst({
                where: { scheduleOrderQueues: { id: args.where.id } }
            });
            await prisma.scheduleOrder.update({
                where: { id: scheduleOrder?.id },
                data: {
                    status: 'InProgress'
                }
            });

            // Validate that the schedule order of interest has an index of -1
            const updatedScheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
                where: { id: args.where.id }
            });

            if (!updatedScheduleOrderQueue || updatedScheduleOrderQueue.queueIndex !== 0) {
                this.logger.error(`Failed to set active schedule order queue. Expected queue index 0, but got ${updatedScheduleOrderQueue?.queueIndex}`);
                throw new Error(`Failed to set active schedule order queue. Expected queue index 0, but got ${updatedScheduleOrderQueue?.queueIndex}`);
            }
            this.logger.log(`Set schedule order ${args.where.id} as active with queue index 0`);
            return updatedScheduleOrderQueue;
        });
    }

    async updateScheduleOrderQueueUnitProcedure<T extends Prisma.ScheduleOrderQueueUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>): Promise<ScheduleOrderQueue> {
        /*
        This will simply update the nextUnitProcedure fields for a given SchO
        */

        return await super.updateScheduleOrderQueue(args);
    }

    async updateScheduleOrderQueueIndex<T extends Prisma.ScheduleOrderQueueUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>, newIndex: number): Promise<ScheduleOrderQueue> {
        /*
        This will update the queueIndex of a SchO and adjust other records accordingly
        */
        this.logger.log(`Updating queue index for schedule order ${args.where.id} to ${newIndex}`);
        if (newIndex < 0 || isNaN(newIndex) || newIndex === undefined) {
            throw new Error(`Invalid queue index: ${newIndex}`);
        }
        return await this.prisma.$transaction(async (prisma) => {
            // Find the schedule order queue to be updated
            const scheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
                where: { id: args.where.id }
            });

            if (!scheduleOrderQueue) {
                throw new Error(`Schedule order queue with id ${args.where.id} not found`);
            }

            const currentIndex = scheduleOrderQueue.queueIndex;

            if (currentIndex === null) {
                throw new Error(`Schedule order queue with id ${args.where.id} has no queue index`);
            }

            if (currentIndex === newIndex) {
                this.logger.warn(`Queue index already set to ${newIndex}`);
                return scheduleOrderQueue;
            }
            this.logger.log(`Updating queue index for schedule order ${args.where.id} from ${currentIndex} to ${newIndex}`);

            // Set the queue index to null to indicate that it has been updated
            await prisma.scheduleOrderQueue.update({
                where: { id: args.where.id },
                data: {
                    queueIndex: null
                }
            });

            // If moving up in queue (lower index)
            if (newIndex < currentIndex) {
                this.logger.log(`Moving up in queue`);
                const scheduleOrderQueues = await prisma.scheduleOrderQueue.findMany({
                    where: {
                        queueIndex: {
                            gte: newIndex,
                            lt: currentIndex
                        }
                    },
                    orderBy: {
                        queueIndex: 'desc'
                    }
                });
                this.logger.log(`Schedule order queues: ${JSON.stringify(scheduleOrderQueues)}`);
                for (const schO of scheduleOrderQueues) {
                    this.logger.log(`Updating queue index for schedule order ${schO.id} from ${schO.queueIndex} to ${schO.queueIndex as number + 1}`);
                    await prisma.scheduleOrderQueue.update({
                        where: { id: schO.id },
                        data: {
                            queueIndex: schO.queueIndex as number + 1
                        }
                    });
                }
            }
            // If moving down in queue (higher index)
            else {
                this.logger.log(`Moving down in queue`);
                const scheduleOrderQueues = await prisma.scheduleOrderQueue.findMany({
                    where: {
                        queueIndex: {
                            lte: newIndex,
                            gt: currentIndex
                        }
                    },
                    orderBy: {
                        queueIndex: 'asc'
                    }
                });
                this.logger.log(`Updating queue index for schedule order ${args.where.id} from ${currentIndex} to ${newIndex}`);
                for (const schO of scheduleOrderQueues) {
                    this.logger.log(`Updating queue index for schedule order ${schO.id} from ${schO.queueIndex} to ${schO.queueIndex as number - 1}`);
                    await prisma.scheduleOrderQueue.update({
                        where: { id: schO.id },
                        data: {
                            queueIndex: schO.queueIndex as number - 1
                        }
                    });
                }
            }

            // Update the target record's index
            const updatedQueue = await prisma.scheduleOrderQueue.update({
                where: { id: args.where.id },
                data: {
                    queueIndex: newIndex
                }
            });

            this.logger.log(`Updated queue index for schedule order ${args.where.id} from ${currentIndex} to ${newIndex}`);
            return updatedQueue;
        });
    }

    async completeScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>): Promise<ScheduleOrderQueue> {
        /*
        This will remove the SchO from the queue and set the status to completed
        */

        return await this.prisma.$transaction(async (prisma) => {
            // Find the schedule order queue to be completed
            const scheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
                where: { id: args.where.id },
                include: { scheduleOrder: true }
            });

            if (!scheduleOrderQueue) {
                throw new Error(`Schedule order queue with id ${args.where.id} not found`);
            }

            // Remove the schedule order from the queue
            await prisma.scheduleOrderQueue.delete({
                where: { id: args.where.id }
            });

            // Update the status of the associated schedule order to 'Complete'
            await prisma.scheduleOrder.update({
                where: { id: scheduleOrderQueue.scheduleOrder?.id },
                data: { status: 'Complete' }
            });

            this.logger.log(`Completed schedule order ${scheduleOrderQueue.scheduleOrder?.id} and removed from queue`);

            // Return the completed schedule order queue
            return scheduleOrderQueue;
        });
    }

    async deactivateScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>): Promise<ScheduleOrderQueue> {
        /*
        This will remove the SchO from the queue and set the status to deactivated
        */

        return await this.prisma.$transaction(async (prisma) => {
            // Find the schedule order queue to be deactivated
            const scheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
                where: { id: args.where.id },
                include: { scheduleOrder: true }
            });

            if (!scheduleOrderQueue) {
                throw new Error(`Schedule order queue with id ${args.where.id} not found`);
            }

            // Remove the schedule order from the queue
            await prisma.scheduleOrderQueue.delete({
                where: { id: args.where.id }
            });

            // Update the status of the associated schedule order to 'Deactivated'
            await prisma.scheduleOrder.update({
                where: { id: scheduleOrderQueue.scheduleOrder?.id },
                data: { status: EnumScheduleOrderStatus.Created } // TODO: Change this to EnumScheduleOrderStatus.Inactive
            });

            this.logger.log(`Deactivated schedule order ${scheduleOrderQueue.scheduleOrder?.id} and removed from queue`);

            // Return the deactivated schedule order queue
            return scheduleOrderQueue;
        });
    }

    async createAndQueueScheduleOrder(
        productionOrderId: string,
        startDate?: Date,
        endDate?: Date,
        bblPerFerm?: number,
        yieldPgPerBsh?: number,
        pgsPerBbl?: number
    ): Promise<ScheduleOrderQueue> {
        return await this.prisma.$transaction(async (prisma) => {
            // Find the production order
            const productionOrder = await prisma.productionOrder.findUnique({
                where: { id: productionOrderId },
                include: {
                    recipe: { include: { recipeGroup: true } },
                }
            });

            if (!productionOrder) {
                throw new Error(`Production order with id ${productionOrderId} not found`);
            }

            try {
                const updateData: any = {};
                if (startDate) updateData.startDate = startDate;
                if (endDate) updateData.endDate = endDate;
                if (bblPerFerm) updateData.estimatedBarrelsPerFermenter = bblPerFerm;
                if (yieldPgPerBsh) updateData.estimatedPGsPerBushel = yieldPgPerBsh;
                if (pgsPerBbl) updateData.estimatedPGsPerBbl = pgsPerBbl;

                await prisma.productionOrder.update({
                    where: { id: productionOrderId },
                    data: updateData
                });
            } catch (error) {
                this.logger.error(`Failed to update production order ${productionOrderId}: ${error}`);
                throw new Error(`Failed to update production order: ${error}`);
            }

            // Create a new schedule order
            const scheduleOrder = await prisma.scheduleOrder.create({
                data: {
                    productionOrders: { connect: { id: productionOrder.id } },
                    status: EnumScheduleOrderStatus.Created,
                    productionOrderAllocation: 0, // Adding required field
                    recipeName: productionOrder.recipe?.Recipe ?? '', // Adding required field with null check
                    recipeGroup: {
                        connect: { id: productionOrder.recipe?.recipeGroup?.id ?? '' }
                    }, // Adding required field with null check
                    estimatedStart: startDate,
                    estimatedEnd: endDate,
                }
            });

            // Get the last queue position
            const lastQueueItem = await prisma.scheduleOrderQueue.findFirst({
                orderBy: {
                    queueIndex: 'desc'
                }
            });

            const nextPosition = lastQueueItem?.queueIndex != null ? lastQueueItem.queueIndex + 1 : 0;

            // Add to queue
            const scheduleOrderQueue = await prisma.scheduleOrderQueue.create({
                data: {
                    createdBy: 'MES', // Adding required createdBy field
                    scheduleOrder: { connect: { id: scheduleOrder.id } },
                    queueIndex: nextPosition,
                    nextUnitProcedureName: EnumUnitProcedureName.Mashing01,
                },
                include: {
                    scheduleOrder: true
                }
            });

            this.logger.log(`Created schedule order ${scheduleOrder.id} and added to queue at position ${nextPosition}`);

            return scheduleOrderQueue;
        });
    }
}
