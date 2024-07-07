import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderQueueServiceBase } from "./base/scheduleOrderQueue.service.base";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

@Injectable()
export class ScheduleOrderQueueService extends ScheduleOrderQueueServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

    async createScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueCreateArgs>): Promise<import(".prisma/client").ScheduleOrderQueue> {
        const scheduleOrderQueue = await super.createScheduleOrderQueue(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Schedulequeue, {
        recordName: 'ScheduleOrderQueue',
        event_type: 'create',
        data: scheduleOrderQueue
        });
        this.logger.log(`Updated ScheduleOrderQueue: ${scheduleOrderQueue.id} & pushed to topic`);
        return scheduleOrderQueue;
    }

    async updateScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueUpdateArgs>): Promise<import(".prisma/client").ScheduleOrderQueue> {
        const scheduleOrderQueue = await super.updateScheduleOrderQueue(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Schedulequeue, {
        recordName: 'ScheduleOrderQueue',
        event_type: 'update',
        data: scheduleOrderQueue
        });
        this.logger.log(`Updated ScheduleOrderQueue: ${scheduleOrderQueue.id} & pushed to topic`);
        return scheduleOrderQueue;
    }

    async deleteScheduleOrderQueue<T extends Prisma.ScheduleOrderQueueDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderQueueDeleteArgs>): Promise<import(".prisma/client").ScheduleOrderQueue> {
        const scheduleOrderQueue = await super.deleteScheduleOrderQueue(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Schedulequeue, {
        recordName: 'ScheduleOrderQueue',
        event_type: 'delete',
        data: scheduleOrderQueue
        });
        this.logger.log(`Deleted ScheduleOrderQueue: ${scheduleOrderQueue.id} & pushed to topic`);
        return scheduleOrderQueue;
    }
}
