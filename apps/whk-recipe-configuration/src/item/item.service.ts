import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemServiceBase } from "./base/item.service.base";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {Prisma} from "@prisma/client";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";

@Injectable()
export class ItemService extends ItemServiceBase {
  constructor(
        protected readonly prisma: PrismaService,
        protected readonly rabbitProducer: RabbitMQProducerService,
        @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    super(prisma);
  }
  async createItem<T extends Prisma.ItemCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemCreateArgs>): Promise<import(".prisma/client").Item> {
    const item = await super.createItem(args);

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Item, {
      event_type: 'create',
      data: item,
      recordName: 'Item',
    });
    this.logger.log(`Updated Item: ${item.id} & pushed to topic`)
    return item;
  }

  async updateItem<T extends Prisma.ItemUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemUpdateArgs>): Promise<import(".prisma/client").Item> {
    const item = await super.updateItem(args);

    // use the id from the update to get the record in the form we want for the message publishing
    const itemPayload = await this.prisma.item.findUnique({
      where: {id: item.id},
    });

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Item, {
      event_type: 'update',
      data: itemPayload,
      recordName: 'Item',
    });
    this.logger.log(`Updated Item: ${item.id} & pushed to topic`)

    return item;
  }

  async deleteItem<T extends Prisma.ItemDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ItemDeleteArgs>): Promise<import(".prisma/client").Item> {
    const item = await super.deleteItem(args);

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Item, {
      event_type: 'delete',
      data: item,
      recordName: 'Item',
    });
    this.logger.log(`Deleted Item: ${item.id} & pushed to topic`)

    return item;
  }
}
