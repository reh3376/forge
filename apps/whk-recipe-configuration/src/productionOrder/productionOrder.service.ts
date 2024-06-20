import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderServiceBase } from "./base/productionOrder.service.base";
import {Logger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";

@Injectable()
export class ProductionOrderService extends ProductionOrderServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private readonly logger: Logger
  ) {
    super(prisma);
  }

    async createProductionOrder<T extends Prisma.ProductionOrderCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionOrderCreateArgs>): Promise<import(".prisma/client").ProductionOrder> {
        const productionOrder = await super.createProductionOrder(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Productionorder, {
        recordName: 'ProductionOrder',
        event_type: 'create',
        data: productionOrder
        });
        this.logger.log(`Updated ProductionOrder: ${productionOrder.id} & pushed to topic`);
        return productionOrder;
    }

    async updateProductionOrder<T extends Prisma.ProductionOrderUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionOrderUpdateArgs>): Promise<import(".prisma/client").ProductionOrder> {
        const productionOrder = await super.updateProductionOrder(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Productionorder, {
        recordName: 'ProductionOrder',
        event_type: 'update',
        data: productionOrder
        });
        this.logger.log(`Updated ProductionOrder: ${productionOrder.id} & pushed to topic`);
        return productionOrder;
    }

    async deleteProductionOrder<T extends Prisma.ProductionOrderDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionOrderDeleteArgs>): Promise<import(".prisma/client").ProductionOrder> {
        const productionOrder = await super.deleteProductionOrder(args);
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Productionorder, {
        recordName: 'ProductionOrder',
        event_type: 'delete',
        data: productionOrder
        });
        this.logger.log(`Deleted ProductionOrder: ${productionOrder.id} & pushed to topic`);
        return productionOrder;
    }
}
