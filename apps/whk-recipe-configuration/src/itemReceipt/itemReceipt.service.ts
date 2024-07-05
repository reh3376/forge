import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemReceiptServiceBase } from "./base/itemReceipt.service.base";
import {Prisma} from "@prisma/client";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {PinoLogger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";

@Injectable()
export class ItemReceiptService extends ItemReceiptServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private logger: PinoLogger,
  ) {
    super(prisma);
  }

    async createItemReceipt<T extends Prisma.ItemReceiptCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptCreateArgs>): Promise<import(".prisma/client").ItemReceipt> {
      const itemReceipt = await super.createItemReceipt({
        data: args.data,
        include: {
          item: true,
          purchaseOrder: true,
        }
      });

      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
        event_type: 'create',
        data: itemReceipt,
        recordName: 'ItemReceipt',
      });
      this.logger.info(`Updated ItemReceipt: ${itemReceipt.id} & pushed to topic`)
      return itemReceipt;
    }

    async updateItemReceipt<T extends Prisma.ItemReceiptUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptUpdateArgs>): Promise<import(".prisma/client").ItemReceipt> {
      const itemReceipt = await super.updateItemReceipt(args);

      // use the id from the update to get the record in the form we want for the message publishing
      const itemReceiptPayload = await this.prisma.itemReceipt.findUnique({
          where: {id: itemReceipt.id},
          include: {
            purchaseOrder: true,
            item: true,
            tests: true,
          }
      });

      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
        event_type: 'update',
        data: itemReceiptPayload,
        recordName: 'ItemReceipt',
      });
        this.logger.info(`Updated ItemReceipt: ${itemReceipt.id} & pushed to topic`)

      return itemReceipt;
    }

    async deleteItemReceipt<T extends Prisma.ItemReceiptDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptDeleteArgs>): Promise<import(".prisma/client").ItemReceipt> {
      const itemReceipt = await super.deleteItemReceipt(args);

      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
        event_type: 'delete',
        data: itemReceipt,
        recordName: 'ItemReceipt',
      });
        this.logger.info(`Deleted ItemReceipt: ${itemReceipt.id} & pushed to topic`)

      return itemReceipt;
    }
}
