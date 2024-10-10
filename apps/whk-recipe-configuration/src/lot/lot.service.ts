import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { EnumLotStatus, Lot, Prisma } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";
import { ar } from "@faker-js/faker";
import { CreateLotArgs } from "./base/CreateLotArgs";
import e from "express";
import { LotUpdateInput } from "./base/LotUpdateInput";

@Injectable()
export class LotService extends LotServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  calculateLotAnalytics(lot: LotCreateInput | LotUpdateInput): any {
    /* CALCULATION DEFINITIONS

    The key inputs to these are...
    1. Weight. Depending on the source vessel for the lot, this will either be direct via start/end weights or via the start/end volumes and the final density
    2. Barrel Entry Proof. This is the proof of the distillate entering the barrel. This 2*100 * the ABV
    3. Distillate final density

    The Metrics to be calculated are...
    1. Density, simple unit conversion
    2. Total WGs (Volume) = Total Weight / Density
    3. Total PGs = Total WGs * EntryProof/100
    4. Average PGs / Bbl = Total PGs / Total Barrels
    5. Average WGs / Bbl = Total WGs / Total Barrels

    */

    if (lot.totalWeight && lot.densityFinal) {
      lot.densityFinal = lot.densityFinal * 8.3454 ?? 0;
      lot.totalVolumeWg = lot.totalWeight / lot.densityFinal;
      lot.totalPGs = lot.totalVolumeWg * (lot.bblEntryProof ?? 0) / 100;
      lot.totalWGs = lot.totalVolumeWg;
      if (lot.totalFermenters) {
        lot.avgPGsFerm = lot.totalPGs / lot.totalFermenters;
      }
      if (lot.bblTotal) {
        lot.avgBblFillByPg = lot.totalPGs / lot.bblTotal;
        lot.avgBblFillByWg = lot.totalWGs / lot.bblTotal;
      }
    } else if (lot.initialWeight && lot.finalWeight && lot.densityFinal) {
      lot.densityFinal = lot.densityFinal * 8.3454 ?? 0;
      const startWeight = lot.initialWeight ?? 0;
      const endWeight = lot.finalWeight ?? 0;
      lot.totalWeight = startWeight - endWeight;
      lot.totalVolumeWg = lot.totalWeight / lot.densityFinal;
      lot.totalPGs = lot.totalVolumeWg * (lot.bblEntryProof ?? 0) / 100;
      lot.totalWGs = lot.totalVolumeWg;
      if (lot.totalFermenters) {
        lot.avgPGsFerm = lot.totalPGs / lot.totalFermenters;
      }
      if (lot.bblTotal) {
        lot.avgBblFillByPg = lot.totalPGs / lot.bblTotal;
        lot.avgBblFillByWg = lot.totalWGs / lot.bblTotal;
      }
    } else if (lot.initialVolume && lot.finalVolume && lot.densityFinal) {
      // convert % to vol, 301.38 gal/% LIT on cistern tanks
      lot.initialVolume = lot.initialVolume * 301.38 ?? 0;
      lot.finalVolume = lot.finalVolume * 301.38 ?? 0;

      lot.densityFinal = lot.densityFinal * 8.3454 ?? 0;
      const startVolume = lot.initialVolume ?? 0;
      const endVolume = lot.finalVolume ?? 0;
      lot.totalWeight = (startVolume - endVolume) * lot.densityFinal;
      lot.totalVolumeWg = startVolume - endVolume;
      lot.totalPGs = lot.totalVolumeWg * (lot.bblEntryProof ?? 0) / 100;
      lot.totalWGs = lot.totalVolumeWg;
      if (lot.totalFermenters) {
        lot.avgPGsFerm = lot.totalPGs / lot.totalFermenters;
      }
      if (lot.bblTotal) {
        lot.avgBblFillByPg = lot.totalPGs / lot.bblTotal;
        lot.avgBblFillByWg = lot.totalWGs / lot.bblTotal;
        lot.status = EnumLotStatus.Complete;
      } else {
        lot.status = EnumLotStatus.PendingBarrelCount;
      }
    }

    return lot;
  }

  async createLot<T extends Prisma.LotCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.LotCreateArgs>
  ): Promise<Lot> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String.fromCharCode(64 + date.getMonth() + 1);
    const day = date.getDate().toString().padStart(2, "0");

    const lotNumberPrefix = `${year}${month}${day}${args.data.lotAlphaChar}`;

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

    if (lastLot.length > 0) {
      throw new Error(`Lot with character ${args.data.lotAlphaChar} has already been created today.`);
    }

    const barrelTypeMapping: { [key: string]: string } = {
      "WVG": "01",
      "ISC": "10",
    };
    if (!args.data.bblOem || !barrelTypeMapping[args.data.bblOem]) {
      throw new Error("BBL OEM must be provided and must be one of the following: WVG, ISC");
    }
    const fullLotNumber = `${lotNumberPrefix}.${barrelTypeMapping[args.data.bblOem]}`;

    // Get the item from the recipe
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: args.data.recipe?.connect?.id },
      include: { item: true },
    });
    if (!recipe) {
      throw new Error("Recipe not found");
    } 

    // Update the args.data with the item from the recipe
    if (!recipe.item) {
      throw new Error("Recipe does not have an associated item");
    }
    args.data.item = { connect: { id: recipe.item.id } };

    // Calculate the lot analytics
    args.data = this.calculateLotAnalytics(args.data as LotCreateInput);
    
    const lot = await super.createLot({
      data: {
        ...args.data,
        lotNumber: `${fullLotNumber}`,
      },
      include: {
        ...args.include,
        productionOrder: true,
        item: true,
        recipe: true,
      },
    });

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Lot, {
      event_type: 'create',
      data: lot,
      recordName: 'Lot',
    });
    
    this.logger.log(`Created Lot: ${lot.lotNumber} & pushed to topic`);
    return lot;
  }

  async updateLot<T extends Prisma.LotUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.LotUpdateArgs>): Promise<import(".prisma/client").Lot> {
    args.data = this.calculateLotAnalytics(args.data as LotUpdateInput);
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
