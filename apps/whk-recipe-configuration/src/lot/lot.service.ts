import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { Lot, Prisma } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";
import { ar } from "@faker-js/faker";

@Injectable()
export class LotService extends LotServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createLot<T extends Prisma.LotCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.LotCreateArgs>
  ): Promise<Lot> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String.fromCharCode(64 + date.getMonth() + 1);
    const day = date.getDate().toString().padStart(2, "0");

    const lotNumberPrefix = `${year}${month}${day}`;

    const lastLot: Lot[] = await this.lots({
      where: {
        lotNumber: {
          startsWith: lotNumberPrefix,
        },
      },
      orderBy: {
        lotNumber: "desc",
      },
      take: 1,
    });

    const barrelTypeMapping: { [key: string]: string } = {
      "WVG": "01",
      "ISC": "10",
    };
    if (!args.data.bblOem || !barrelTypeMapping[args.data.bblOem]) {
      throw new Error("BBL OEM must be provided and must be one of the following: WVG, ISC");
    }
    const fullLotNumber = `${lotNumberPrefix}${args.data.lotAlphaChar}${barrelTypeMapping[args.data.bblOem]}`;
    const lastLotIdIndex = lastLot.length > 0 ? parseInt(lastLot[0].lotNumber.split(".").pop()?.slice(-3) || "0") : -1;
    const newIndex = `${lastLotIdIndex + 1}`.padStart(3, "0");

    const lot = await super.createLot({
      data: {
        ...args.data,
        lotNumber: `${lotNumberPrefix}${newIndex}`,
      },
      include: {
        ...args.include,
        productionOrder: true,
        item: true,
        recipe: true,
      },
    });

    this.logger.log(`Created Lot: ${lot.lotNumber} & pushed to topic`);
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
