import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderServiceBase } from "./base/productionOrder.service.base";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

@Injectable()
export class ProductionOrderService extends ProductionOrderServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger  
  ) {
    super(prisma);
  }

    async createProductionOrder<T extends Prisma.ProductionOrderCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionOrderCreateArgs>): Promise<import(".prisma/client").ProductionOrder> {
        const productionOrder = await super.createProductionOrder({
            data: {
                ...args.data,
            },
            include: {
                ...args.include,
                scheduleOrder: true,
                item: true,
                recipe: true,
                recipeGroup: true,
                salesOrder: true,
                bom: true,
            }
        });
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Productionorder, {
        recordName: 'ProductionOrder',
        event_type: 'create',
        data: productionOrder
        });
        this.logger.log(`Updated ProductionOrder: ${productionOrder.id} & pushed to topic`);
        return productionOrder;
    }

    async updateProductionOrder<T extends Prisma.ProductionOrderUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionOrderUpdateArgs>): Promise<import(".prisma/client").ProductionOrder> {
        const productionOrder = await super.updateProductionOrder({
            data: {
                ...args.data,
            },
            include: {
                ...args.include,
                scheduleOrder: true,
                item: true,
                recipe: true,
                recipeGroup: true,
                salesOrder: true,
                bom: true,
            },
            where: args.where,
        });
        await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Productionorder, {
        recordName: 'ProductionOrder',
        event_type: 'update',
        data: productionOrder
        });
        this.logger.log(`Updated ProductionOrder: ${productionOrder.id} & pushed to topic`);
        return productionOrder;
    }

    async deleteProductionOrder<T extends Prisma.ProductionOrderDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionOrderDeleteArgs>): Promise<import(".prisma/client").ProductionOrder> {
        throw new Error("Delete operations are not allowed for ProductionOrder.");
    }
}
