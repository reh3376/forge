import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { MqttEventPublishRuleService } from "./mqttEventPublishRule.service";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";
import { Prisma } from "@prisma/client";
import { InputJsonValue } from "../types";
import {
  MqttEventPublishRule,
  MqttEventPublishRuleCreateInput,
  MqttEventPublishRuleUpdateInput,
  MqttEventPublishRuleWhereUniqueInput,
  TestPublishRuleResult,
} from "./dto/mqtt-event-publish-rule.types";

@Resolver(() => MqttEventPublishRule)
export class MqttEventPublishRuleResolver {
  constructor(
    private readonly service: MqttEventPublishRuleService,
    private readonly domainPublisher: MqttDomainPublisherService
  ) {}

  @Query(() => [MqttEventPublishRule], {
    name: "mqttEventPublishRules",
    description: "List all MQTT event publish rules",
  })
  async findMany(): Promise<MqttEventPublishRule[]> {
    return this.service.findMany({
      include: { brokers: true },
      orderBy: { priority: "desc" },
    }) as Promise<MqttEventPublishRule[]>;
  }

  @Query(() => MqttEventPublishRule, {
    name: "mqttEventPublishRule",
    nullable: true,
    description: "Get a single MQTT event publish rule by ID",
  })
  async findOne(
    @Args("where") where: MqttEventPublishRuleWhereUniqueInput
  ): Promise<MqttEventPublishRule | null> {
    try {
      return (await this.service.findOne(where.id)) as MqttEventPublishRule;
    } catch {
      return null;
    }
  }

  @Mutation(() => MqttEventPublishRule, {
    name: "createMqttEventPublishRule",
    description: "Create a new MQTT event publish rule",
  })
  async create(
    @Args("data") data: MqttEventPublishRuleCreateInput
  ): Promise<MqttEventPublishRule> {
    // Transform the GraphQL input to Prisma input
    const prismaData: Prisma.MqttEventPublishRuleCreateInput = {
      name: data.name,
      description: data.description,
      entityType: data.entityType,
      eventType: data.eventType,
      severityFilter: data.severityFilter || [],
      phaseFilter: data.phaseFilter || [],
      assetFilter: data.assetFilter || [],
      topicTemplate: data.topicTemplate,
      payloadMode: data.payloadMode,
      includeRelations: data.includeRelations || [],
      excludeFields: data.excludeFields || [],
      payloadTransform:
        data.payloadTransform === null || data.payloadTransform === undefined
          ? Prisma.JsonNull
          : (data.payloadTransform as InputJsonValue),
      qos: data.qos ?? 1,
      retain: data.retain ?? false,
      enabled: data.enabled ?? true,
      priority: data.priority ?? 0,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
      brokers: data.brokers?.connect
        ? { connect: data.brokers.connect }
        : undefined,
    };

    return this.service.create(prismaData) as Promise<MqttEventPublishRule>;
  }

  @Mutation(() => MqttEventPublishRule, {
    name: "updateMqttEventPublishRule",
    description: "Update an existing MQTT event publish rule",
  })
  async update(
    @Args("where") where: MqttEventPublishRuleWhereUniqueInput,
    @Args("data") data: MqttEventPublishRuleUpdateInput
  ): Promise<MqttEventPublishRule> {
    // Transform the GraphQL input to Prisma input
    const prismaData: Prisma.MqttEventPublishRuleUpdateInput = {};

    if (data.name !== undefined) prismaData.name = data.name;
    if (data.description !== undefined)
      prismaData.description = data.description;
    if (data.entityType !== undefined) prismaData.entityType = data.entityType;
    if (data.eventType !== undefined) prismaData.eventType = data.eventType;
    if (data.severityFilter !== undefined)
      prismaData.severityFilter = data.severityFilter;
    if (data.phaseFilter !== undefined)
      prismaData.phaseFilter = data.phaseFilter;
    if (data.assetFilter !== undefined)
      prismaData.assetFilter = data.assetFilter;
    if (data.topicTemplate !== undefined)
      prismaData.topicTemplate = data.topicTemplate;
    if (data.payloadMode !== undefined)
      prismaData.payloadMode = data.payloadMode;
    if (data.includeRelations !== undefined)
      prismaData.includeRelations = data.includeRelations;
    if (data.excludeFields !== undefined)
      prismaData.excludeFields = data.excludeFields;
    if (data.payloadTransform !== undefined) {
      prismaData.payloadTransform =
        data.payloadTransform === null
          ? Prisma.JsonNull
          : (data.payloadTransform as InputJsonValue);
    }
    if (data.qos !== undefined) prismaData.qos = data.qos;
    if (data.retain !== undefined) prismaData.retain = data.retain;
    if (data.enabled !== undefined) prismaData.enabled = data.enabled;
    if (data.priority !== undefined) prismaData.priority = data.priority;
    if (data.updatedBy !== undefined) prismaData.updatedBy = data.updatedBy;
    if (data.brokers?.set) {
      prismaData.brokers = { set: data.brokers.set };
    }

    return this.service.update(
      where.id,
      prismaData
    ) as Promise<MqttEventPublishRule>;
  }

  @Mutation(() => MqttEventPublishRule, {
    name: "deleteMqttEventPublishRule",
    description: "Delete an MQTT event publish rule",
  })
  async delete(
    @Args("where") where: MqttEventPublishRuleWhereUniqueInput
  ): Promise<MqttEventPublishRule> {
    return this.service.delete(where.id) as Promise<MqttEventPublishRule>;
  }

  @Mutation(() => Boolean, {
    name: "refreshMqttPublishRulesCache",
    description: "Force-refresh the MQTT domain publisher rule cache",
  })
  async refreshCache(): Promise<boolean> {
    return this.service.refreshPublisherCache();
  }

  @Mutation(() => TestPublishRuleResult, {
    name: "testMqttPublishRule",
    description:
      "Test a publish rule by sending a sample message to configured brokers",
  })
  async testRule(
    @Args("where") where: MqttEventPublishRuleWhereUniqueInput
  ): Promise<TestPublishRuleResult> {
    return this.domainPublisher.testPublishRule(where.id);
  }
}
