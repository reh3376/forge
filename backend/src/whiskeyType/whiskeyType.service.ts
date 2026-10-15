import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, WhiskeyType } from "@prisma/client";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";

@Injectable()
export class WhiskeyTypeService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly rabbitProducer?: RabbitMQProducerService
  ) {}

  async findMany(args: Prisma.WhiskeyTypeFindManyArgs): Promise<WhiskeyType[]> {
    return this.prisma.whiskeyType.findMany(args);
  }

  async findOne(
    args: Prisma.WhiskeyTypeFindUniqueArgs
  ): Promise<WhiskeyType | null> {
    return this.prisma.whiskeyType.findUnique(args);
  }

  async create(args: Prisma.WhiskeyTypeCreateArgs): Promise<WhiskeyType> {
    const whiskeyType = await this.prisma.whiskeyType.create(args);

    // Emit RabbitMQ event for created WhiskeyType
    if (this.rabbitProducer) {
      await this.rabbitProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01WhiskeyType,
        {
          action: "CREATE",
          data: whiskeyType,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return whiskeyType;
  }

  async update(args: Prisma.WhiskeyTypeUpdateArgs): Promise<WhiskeyType> {
    const whiskeyType = await this.prisma.whiskeyType.update(args);

    // Emit RabbitMQ event for updated WhiskeyType
    if (this.rabbitProducer) {
      await this.rabbitProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01WhiskeyType,
        {
          action: "UPDATE",
          data: whiskeyType,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return whiskeyType;
  }

  async delete(args: Prisma.WhiskeyTypeDeleteArgs): Promise<WhiskeyType> {
    const whiskeyType = await this.prisma.whiskeyType.delete(args);

    // Emit RabbitMQ event for deleted WhiskeyType
    if (this.rabbitProducer) {
      await this.rabbitProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01WhiskeyType,
        {
          action: "DELETE",
          data: whiskeyType,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return whiskeyType;
  }

  async count(args?: Prisma.WhiskeyTypeCountArgs): Promise<number> {
    return this.prisma.whiskeyType.count(args);
  }

  async findByCode(code: string): Promise<WhiskeyType | null> {
    return this.prisma.whiskeyType.findUnique({
      where: { code },
    });
  }

  async getActiveWhiskeyTypes(): Promise<WhiskeyType[]> {
    return this.prisma.whiskeyType.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  }

  async getTTBDefinitions(): Promise<WhiskeyType[]> {
    return this.prisma.whiskeyType.findMany({
      where: {
        isTTBDefinition: true,
        active: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async getDerivedTypes(ttbWhiskeyTypeId: string): Promise<WhiskeyType[]> {
    return this.prisma.whiskeyType.findMany({
      where: {
        ttbWhiskeyTypeId,
        active: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async getWhiskeyTypeWithRelations(id: string): Promise<WhiskeyType | null> {
    return this.prisma.whiskeyType.findUnique({
      where: { id },
      include: {
        ttbWhiskeyType: true,
        derivedWhiskeyTypes: {
          where: { active: true },
          orderBy: { name: "asc" },
        },
      },
    });
  }
}
