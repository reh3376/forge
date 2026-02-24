import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";
import { MqttEventPublishRule, Prisma } from "@prisma/client";

@Injectable()
export class MqttEventPublishRuleService {
  private readonly logger = new Logger(MqttEventPublishRuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttDomainPublisher: MqttDomainPublisherService
  ) {}

  async findMany(
    args?: Prisma.MqttEventPublishRuleFindManyArgs
  ): Promise<MqttEventPublishRule[]> {
    return this.prisma.mqttEventPublishRule.findMany(args);
  }

  async findOne(id: string): Promise<MqttEventPublishRule> {
    const rule = await this.prisma.mqttEventPublishRule.findUnique({
      where: { id },
      include: { brokers: true },
    });
    if (!rule)
      throw new NotFoundException(`MqttEventPublishRule not found: ${id}`);
    return rule;
  }

  async create(
    data: Prisma.MqttEventPublishRuleCreateInput
  ): Promise<MqttEventPublishRule> {
    const rule = await this.prisma.mqttEventPublishRule.create({
      data,
      include: { brokers: true },
    });
    this.logger.log(`Created MqttEventPublishRule: ${rule.id} (${rule.name})`);
    await this.mqttDomainPublisher.refreshCache();
    return rule;
  }

  async update(
    id: string,
    data: Prisma.MqttEventPublishRuleUpdateInput
  ): Promise<MqttEventPublishRule> {
    const rule = await this.prisma.mqttEventPublishRule.update({
      where: { id },
      data,
      include: { brokers: true },
    });
    this.logger.log(`Updated MqttEventPublishRule: ${rule.id} (${rule.name})`);
    await this.mqttDomainPublisher.refreshCache();
    return rule;
  }

  async delete(id: string): Promise<MqttEventPublishRule> {
    const rule = await this.prisma.mqttEventPublishRule.delete({
      where: { id },
    });
    this.logger.log(`Deleted MqttEventPublishRule: ${rule.id}`);
    await this.mqttDomainPublisher.refreshCache();
    return rule;
  }

  async refreshPublisherCache(): Promise<boolean> {
    await this.mqttDomainPublisher.refreshCache();
    return true;
  }
}
