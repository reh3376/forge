import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemReceiptServiceBase } from "./base/itemReceipt.service.base";
import {Prisma} from "@prisma/client";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";

@Injectable()
export class ItemReceiptService extends ItemReceiptServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    super(prisma);
  }

    async createItemReceipt<T extends Prisma.ItemReceiptCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptCreateArgs>): Promise<import(".prisma/client").ItemReceipt> {
      // get the grain tests statically for now. 
      const grainTests = await this.prisma.testParameter.findMany({
        where: {
          active: true,
          isClassDef: true,
        }
      });
      
      const itemReceipt = await super.createItemReceipt({
        data: args.data,
        include: {
          item: true,
          purchaseOrder: true,
        }
      });

      // create the grain test instances 
      for (const test of grainTests) {
        await this.prisma.testParameter.create({
          data: {
            testParamUnits: test.testParamUnits,
            name: test.name,
            description: test.description,
            createdBy: args.data.createdBy,
            testSetpointType: test.testSetpointType,
            testParamRevision: test.testParamRevision,
            testSetpointBooleanValue: test.testSetpointBooleanValue,
            testSetpointLowerLimit: test.testSetpointLowerLimit,
            testSetpointUpperLimit: test.testSetpointUpperLimit,
            testSetpointValue: test.testSetpointValue,
            active: true,
            isClassDef: false,
            classId: { connect: { id: test.id } },
            itemReceipt: { connect: { id: itemReceipt.id } },
          }
        });
      }
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
          }  
      });
      // Check if quantity is in the args and over 10k
      if (args.data.quantity && typeof args.data.quantity === 'number' && args.data.quantity > 10000) {
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
          event_type: 'large_quantity_update',
          // data: {
            // id: itemReceipt.id,
            // quantity: args.data.quantity,
            // item: itemReceiptPayload?.item,
            // purchaseOrder: itemReceiptPayload?.purchaseOrder
          // },
          data: {
            ...itemReceiptPayload,
          },
          id: itemReceipt.id,
          quantity: args.data.quantity,
          item: itemReceiptPayload?.item,
          purchaseOrder: itemReceiptPayload?.purchaseOrder,
          recordName: 'ItemReceipt',
        });
        this.logger.log(`Emitted large quantity update for ItemReceipt: ${itemReceipt.id}`);
      }

      return itemReceipt;
    }

    async deleteItemReceipt<T extends Prisma.ItemReceiptDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptDeleteArgs>): Promise<import(".prisma/client").ItemReceipt> {
      const itemReceipt = await super.deleteItemReceipt(args);

      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
        event_type: 'delete',
        data: itemReceipt,
        recordName: 'ItemReceipt',
      });
        this.logger.log(`Deleted ItemReceipt: ${itemReceipt.id} & pushed to topic`)

      return itemReceipt;
    }
}
