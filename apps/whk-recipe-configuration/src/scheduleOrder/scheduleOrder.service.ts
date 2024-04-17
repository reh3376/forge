import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderServiceBase } from "./base/scheduleOrder.service.base";
import {Prisma, ScheduleOrder} from "@prisma/client";
import {ScheduleOrderCreateInput} from "./base/ScheduleOrderCreateInput";
import {MyMessageBrokerTopics} from "../message-broker/topics";

@Injectable()
export class ScheduleOrderService extends ScheduleOrderServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createScheduleOrder<T extends Prisma.ScheduleOrderCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ScheduleOrderCreateArgs>): Promise<ScheduleOrder> {
    /* handle the auto creation of a human readeable schedule order id */
    const order = await super.createScheduleOrder(args);
    await this.kafkaProducer.sourceEntityTopic(MyMessageBrokerTopics.ScheduleOrderEvents,'create', order.id, order);
    return order;
  }
}
