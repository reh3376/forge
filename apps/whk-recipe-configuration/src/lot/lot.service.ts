import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { EnumLotStatus, Lot, Prisma } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";
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

  async calculateLotAnalytics(
    lot: LotCreateInput | (LotUpdateInput & { where: Prisma.LotWhereUniqueInput } & { data: Prisma.LotUpdateInput }),
    type: string='create'
  ): Promise<any> {
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
    let mergedLot: any = {};

    if (type === 'create') {
      mergedLot = { ...lot };
    } else if (type === 'update' && 'where' in lot && 'data' in lot) {
      const existingLot = await this.prisma.lot.findUnique({
        where: { id: lot.where.id },
      });

      if (!existingLot) {
        throw new Error('Lot not found');
      }

      mergedLot = {
        ...existingLot,
        ...Object.fromEntries(
          Object.entries(lot.data).filter(([_, value]) => value !== undefined)
        ),
      };
    } else {
      throw new Error('Invalid input for lot calculation');
    }

    // Perform calculations
    if (mergedLot.densityFinal && mergedLot.densityFinal <= 1) {
      mergedLot.densityFinal *= 8.3454;
    }

    if (mergedLot.totalWeight && mergedLot.densityFinal) {
      mergedLot.totalVolumeWg = mergedLot.totalWeight / mergedLot.densityFinal;
    } else if (mergedLot.initialWeight && mergedLot.finalWeight && mergedLot.densityFinal) {
      mergedLot.totalWeight = mergedLot.initialWeight - mergedLot.finalWeight;
      mergedLot.totalVolumeWg = mergedLot.totalWeight / mergedLot.densityFinal;
    } else if (mergedLot.initialVolume && mergedLot.finalVolume && mergedLot.densityFinal) {
      mergedLot.initialVolume *= 301.38;
      mergedLot.finalVolume *= 301.38;
      mergedLot.totalWeight = (mergedLot.initialVolume - mergedLot.finalVolume) * mergedLot.densityFinal;
      mergedLot.totalVolumeWg = mergedLot.initialVolume - mergedLot.finalVolume;
    }

    if (mergedLot.totalVolumeWg) {
      mergedLot.totalPGs = mergedLot.totalVolumeWg * (mergedLot.bblEntryProof || 0) / 100;
      mergedLot.totalWGs = mergedLot.totalVolumeWg;

      if (mergedLot.totalFermenters) {
        mergedLot.avgPGsFerm = mergedLot.totalPGs / mergedLot.totalFermenters;
      }

      if (mergedLot.bblTotal) {
        mergedLot.avgBblFillByPg = mergedLot.totalPGs / mergedLot.bblTotal;
        mergedLot.avgBblFillByWg = mergedLot.totalWGs / mergedLot.bblTotal;
        mergedLot.status = EnumLotStatus.Complete;
      } else {
        mergedLot.status = EnumLotStatus.PendingBarrelCount;
      }
    }

    // Return only the calculated fields and essential data
    return {
      totalWeight: mergedLot.totalWeight,
      totalVolumeWg: mergedLot.totalVolumeWg,
      totalPGs: mergedLot.totalPGs,
      totalWGs: mergedLot.totalWGs,
      avgPGsFerm: mergedLot.avgPGsFerm,
      avgBblFillByPg: mergedLot.avgBblFillByPg,
      avgBblFillByWg: mergedLot.avgBblFillByWg,
      status: mergedLot.status,
      densityFinal: mergedLot.densityFinal,
    };
  }

  async createLot<T extends Prisma.LotCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.LotCreateArgs>
  ): Promise<Lot> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String.fromCharCode(64 + date.getMonth() + 1);
    const day = date.getDate().toString().padStart(2, "0");
    const barrelTypeMapping: { [key: string]: string } = {
      "WVG": "01",
      "ISC": "10",
    };
    const bblOem = args.data.bblOem;
    if (!args.data.bblOem || !barrelTypeMapping[args.data.bblOem]) {
      throw new Error("BBL OEM must be provided and must be one of the following: WVG, ISC");
    }
    const bblType = barrelTypeMapping[bblOem as string];


    const lotNumberPrefix = `${year}${month}${day}${args.data.lotAlphaChar}.${bblType}`;

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
    this.logger.log(`Last lot: ${lastLot}`);
    this.logger.log(`lotNumberPrefix: ${lotNumberPrefix}`);

    let fullLotNumber: string;
    if (!args.data.lotNumber) {
      if (lastLot.length > 0) {
        throw new Error(`Lot with character ${args.data.lotAlphaChar} has already been created today.`);
      }
      fullLotNumber = `${lotNumberPrefix}.${barrelTypeMapping[args.data.bblOem]}`;
    } else {
      fullLotNumber = args.data.lotNumber;
    }

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
    const calculatedData = await this.calculateLotAnalytics(args.data as LotCreateInput);
    
    const lot = await super.createLot({
      data: {
        ...args.data,
        ...calculatedData,
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
    const calculatedData = await this.calculateLotAnalytics({
      where: args.where,
      data: {
        ...args.data,
        filledFrom: args.data.filledFrom
          ? { connect: { id: args.data.filledFrom.connect?.id } }
          : undefined
      }
    }, 'update');
    args.data = {
      ...args.data,
      ...calculatedData
    };
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
