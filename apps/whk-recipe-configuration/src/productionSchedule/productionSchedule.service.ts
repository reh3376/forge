import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionScheduleServiceBase } from "./base/productionSchedule.service.base";
import {Logger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";

@Injectable()
export class ProductionScheduleService extends ProductionScheduleServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private readonly logger: Logger
  ) {
    super(prisma);
  }

    async createProductionSchedule<T extends Prisma.ProductionScheduleCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionScheduleCreateArgs>): Promise<import(".prisma/client").ProductionSchedule> {
        const productionSchedule = await super.createProductionSchedule(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Productionschedule, {
        recordName: 'ProductionSchedule',
        event_type: 'create',
        data: productionSchedule
        });
        this.logger.log(`Updated ProductionSchedule: ${productionSchedule.id} & pushed to topic`);
        return productionSchedule;
    }

    async updateProductionSchedule<T extends Prisma.ProductionScheduleUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionScheduleUpdateArgs>): Promise<import(".prisma/client").ProductionSchedule> {
        const productionSchedule = await super.updateProductionSchedule(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Productionschedule, {
        recordName: 'ProductionSchedule',
        event_type: 'update',
        data: productionSchedule
        });
        this.logger.log(`Updated ProductionSchedule: ${productionSchedule.id} & pushed to topic`);
        return productionSchedule;
    }

    async deleteProductionSchedule<T extends Prisma.ProductionScheduleDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ProductionScheduleDeleteArgs>): Promise<import(".prisma/client").ProductionSchedule> {
        const productionSchedule = await super.deleteProductionSchedule(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Productionschedule, {
        recordName: 'ProductionSchedule',
        event_type: 'delete',
        data: productionSchedule
        });
        this.logger.log(`Deleted ProductionSchedule: ${productionSchedule.id} & pushed to topic`);
        return productionSchedule;
    }
}
