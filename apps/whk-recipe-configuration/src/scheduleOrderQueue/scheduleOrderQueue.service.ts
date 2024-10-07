import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderQueueServiceBase } from "./base/scheduleOrderQueue.service.base";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {EnumScheduleOrderStatus, Prisma, ScheduleOrderQueue} from "@prisma/client";
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
}
