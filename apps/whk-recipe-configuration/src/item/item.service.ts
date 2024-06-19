import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemServiceBase } from "./base/item.service.base";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {PinoLogger} from "nestjs-pino";
import {Prisma} from "@prisma/client";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";

@Injectable()
export class ItemService extends ItemServiceBase {
  constructor(
        protected readonly prisma: PrismaService,
        protected readonly rabbitProducer: RabbitMQProducerService,
        private logger: PinoLogger,
  ) {
    super(prisma);
  }
  async createItem<T extends Prisma.ItemCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemCreateArgs>): Promise<import(".prisma/client").Item> {
    const item = await super.createItem(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Item, {
      event_type: 'create',
      data: item,
      recordName: 'Item',
    });
    this.logger.info(`Updated Item: ${item.id} & pushed to topic`)
    return item;
  }

  async updateItem<T extends Prisma.ItemUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemUpdateArgs>): Promise<import(".prisma/client").Item> {
    const item = await super.updateItem(args);

    // use the id from the update to get the record in the form we want for the message publishing
    const itemPayload = await this.prisma.item.findUnique({
      where: {id: item.id},
      include: {
        itemGroup: true,
      }
    });

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Item, {
      event_type: 'update',
      data: itemPayload,
      recordName: 'Item',
    });
    this.logger.info(`Updated Item: ${item.id} & pushed to topic`)

    return item;
  }

  async deleteItem<T extends Prisma.ItemDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ItemDeleteArgs>): Promise<import(".prisma/client").Item> {
    const item = await super.deleteItem(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Item, {
      event_type: 'delete',
      data: item,
      recordName: 'Item',
    });
    this.logger.info(`Deleted Item: ${item.id} & pushed to topic`)

    return item;
  }
}
