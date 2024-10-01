import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

@Injectable()
export class LotService extends LotServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createLot<T extends Prisma.LotCreateArgs>(args: Prisma.SelectSubset<T, Prisma.LotCreateArgs>): Promise<import(".prisma/client").Lot> {
    const lot = await super.createLot({
        data: {
            ...args.data,
        },
        include: {
            ...args.include,
            productionOrder: true,
            item: true,
            recipe: true,
        },
    });

    this.logger.log(`Updated Lot: ${lot.lotNumber} & pushed to topic`);
    return lot;
  }

    async updateLot<T extends Prisma.LotUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.LotUpdateArgs>): Promise<import(".prisma/client").Lot> {
      const Lot = await super.updateLot({
        data: {
            ...args.data,
        },
        include: {
            ...args.include,
            productionOrder: true,
            item: true,
            recipe: true,
        },
        where: args.where,
    });
      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Lot, {
        event_type: 'update',
        data: Lot,
        recordName: 'Lot',

      });
      this.logger.log(`Updated Lot: ${Lot.lotNumber} & pushed to topic`);
      return Lot;
    }

    async deleteLot<T extends Prisma.LotDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.LotDeleteArgs>): Promise<import(".prisma/client").Lot> {
      throw new Error("Delete operations are not allowed for Lot.");
    }
}
