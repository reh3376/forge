import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";
import {Logger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";

@Injectable()
export class LotService extends LotServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createLot<T extends Prisma.LotCreateArgs>(args: Prisma.SelectSubset<T, Prisma.LotCreateArgs>): Promise<import(".prisma/client").Lot> {
    const lot = await super.createLot(args);
    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Lot, {
        recordName: 'Lot',
        event_type: 'create',
        data: lot
    });

    this.logger.log(`Updated Lot: ${lot.lotNumber} & pushed to topic`);
    return lot;
  }

    async updateLot<T extends Prisma.LotUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.LotUpdateArgs>): Promise<import(".prisma/client").Lot> {
      const Lot = await super.updateLot(args);
      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Lot, {
        event_type: 'update',
        data: Lot,
        recordName: 'Lot',

      });
      this.logger.log(`Updated Lot: ${Lot.lotNumber} & pushed to topic`);
      return Lot;
    }

    async deleteLot<T extends Prisma.LotDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.LotDeleteArgs>): Promise<import(".prisma/client").Lot> {
      const Lot = await super.deleteLot(args);
      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Lot, {
        recordName: 'Lot',
        event_type: 'delete',
        data: Lot
      });
      this.logger.log(`Deleted Lot: ${Lot.lotNumber} & pushed to topic`);
      return Lot;
    }
}
