import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderServiceBase } from "./base/scheduleOrder.service.base";
import {Prisma, ScheduleOrder} from "@prisma/client";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";

@Injectable()
export class ScheduleOrderService extends ScheduleOrderServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

    async createScheduleOrder<T extends Prisma.ScheduleOrderCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderCreateArgs>): Promise<ScheduleOrder> {
        const scheduleOrder = await super.createScheduleOrder(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder, {
        recordName: 'ScheduleOrder',
        event_type: 'create',
        data: scheduleOrder
        });
        this.logger.log(`Updated ScheduleOrder: ${scheduleOrder.id} & pushed to topic`);
        return scheduleOrder;
    }

    async updateScheduleOrder<T extends Prisma.ScheduleOrderUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderUpdateArgs>): Promise<ScheduleOrder> {
        const scheduleOrder = await super.updateScheduleOrder(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder, {
        recordName: 'ScheduleOrder',
        event_type: 'update',
        data: scheduleOrder
        });
        this.logger.log(`Updated ScheduleOrder: ${scheduleOrder.id} & pushed to topic`);
        return scheduleOrder;
    }

    async deleteScheduleOrder<T extends Prisma.ScheduleOrderDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderDeleteArgs>): Promise<ScheduleOrder> {
        const scheduleOrder = await super.deleteScheduleOrder(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder, {
        recordName: 'ScheduleOrder',
        event_type: 'delete',
        data: scheduleOrder
        });
        this.logger.log(`Deleted ScheduleOrder: ${scheduleOrder.id} & pushed to topic`);
        return scheduleOrder;
    }

}
