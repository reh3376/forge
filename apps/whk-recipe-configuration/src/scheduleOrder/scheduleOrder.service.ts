import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderServiceBase } from "./base/scheduleOrder.service.base";
import { Prisma, ScheduleOrder } from "@prisma/client";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";

@Injectable()
export class ScheduleOrderService extends ScheduleOrderServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createScheduleOrder<T extends Prisma.ScheduleOrderCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ScheduleOrderCreateArgs>
  ): Promise<ScheduleOrder> {
    const scheduleOrder = await super.createScheduleOrder({
      data: {
        ...args.data,
      },
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
        event_type: "create",
        data: scheduleOrder,
      }
    );
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
      const scheduleOrder = await super.updateScheduleOrder({
        data: args.data,
        where: args.where,
        include: {
          recipeGroup: true,
          scheduleOrderQueues: true,
          productionOrders: true,
        },
      });
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
    this.logger.log(
      `Deleted ScheduleOrder: ${scheduleOrder.id} & pushed to topic`
    );
    return scheduleOrder;
  }
}
