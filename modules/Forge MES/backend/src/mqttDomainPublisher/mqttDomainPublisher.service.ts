import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MqttService } from "../providers/mqtt/mqtt.service";
import { MqttEventPublishRule, EnumPayloadMode } from "@prisma/client";
import { DomainEventParams } from "./types";
import { resolveTopicTemplate } from "./topic-template.resolver";

interface RuleWithBrokers extends MqttEventPublishRule {
  brokers: { id: string }[];
}

@Injectable()
export class MqttDomainPublisherService implements OnModuleInit {
  private readonly logger = new Logger(MqttDomainPublisherService.name);

  /** Map of "entityType::eventType" -> rules. Wildcard rules keyed as "entityType::*" */
  private ruleCache = new Map<string, RuleWithBrokers[]>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttService: MqttService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    try {
      const rules = await this.prisma.mqttEventPublishRule.findMany({
        where: { enabled: true },
        include: { brokers: { select: { id: true } } },
        orderBy: { priority: "desc" },
      });

      const cache = new Map<string, RuleWithBrokers[]>();
      for (const rule of rules) {
        const key = `${rule.entityType}::${rule.eventType}`;
        if (!cache.has(key)) cache.set(key, []);
        cache.get(key)!.push(rule);
      }

      this.ruleCache = cache;
      this.cacheLoadedAt = Date.now();
      this.logger.log(`Loaded ${rules.length} MQTT publish rule(s)`);
    } catch (error) {
      this.logger.error("Failed to load MQTT publish rules", error);
    }
  }

  private async ensureFreshCache(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS) {
      await this.refreshCache();
    }
  }

  /**
   * Core method: publish a domain event to MQTT based on matching rules.
   * Fire-and-forget — errors are logged but never thrown.
   */
  async publishDomainEvent(params: DomainEventParams): Promise<void> {
    try {
      await this.ensureFreshCache();

      const exactKey = `${params.entityType}::${params.eventType}`;
      const wildcardKey = `${params.entityType}::*`;

      const matchedRules = [
        ...(this.ruleCache.get(exactKey) || []),
        ...(this.ruleCache.get(wildcardKey) || []),
      ];

      if (matchedRules.length === 0) return;

      for (const rule of matchedRules) {
        try {
          await this.processRule(rule, params);
        } catch (ruleError) {
          this.logger.warn(
            `Rule "${rule.name}" failed for ${params.entityType}/${params.eventType}: ${ruleError}`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `publishDomainEvent failed for ${params.entityType}/${params.eventType}: ${error}`
      );
    }
  }

  private async processRule(
    rule: RuleWithBrokers,
    params: DomainEventParams
  ): Promise<void> {
    // Apply filters
    if (!this.matchesFilters(rule, params)) return;

    // Resolve topic
    const topic = resolveTopicTemplate(
      rule.topicTemplate,
      params.entityType,
      params.eventType,
      params.data,
      params.context
    );

    // Shape payload
    const payload = this.shapePayload(rule, params);
    const message = JSON.stringify(payload);

    // Publish to each broker
    for (const broker of rule.brokers) {
      try {
        if (!this.mqttService.isBrokerConnected(broker.id)) {
          this.logger.debug(`Broker ${broker.id} not connected, skipping`);
          continue;
        }

        await this.mqttService.publish(broker.id, topic, message, {
          qos: rule.qos,
          retain: rule.retain,
        });

        this.logger.debug(
          `Published ${params.entityType}/${params.eventType} to ${topic} on broker ${broker.id}`
        );
      } catch (publishError) {
        this.logger.warn(
          `Failed to publish to broker ${broker.id} topic ${topic}: ${publishError}`
        );
      }
    }
  }

  private matchesFilters(
    rule: RuleWithBrokers,
    params: DomainEventParams
  ): boolean {
    const ctx = params.context || {};

    if (rule.severityFilter.length > 0 && ctx.severity) {
      if (!rule.severityFilter.includes(ctx.severity)) return false;
    }

    if (rule.phaseFilter.length > 0 && ctx.phase) {
      if (!rule.phaseFilter.includes(ctx.phase)) return false;
    }

    if (rule.assetFilter.length > 0 && ctx.assetId) {
      if (!rule.assetFilter.includes(ctx.assetId)) return false;
    }

    return true;
  }

  private shapePayload(
    rule: RuleWithBrokers,
    params: DomainEventParams
  ): Record<string, any> {
    const timestamp = new Date().toISOString();

    if (rule.payloadMode === EnumPayloadMode.EventOnly) {
      return {
        entityType: params.entityType,
        eventType: params.eventType,
        entityId: params.data.id || null,
        timestamp,
        context: params.context || {},
      };
    }

    // Full or Custom mode — start with the full data
    const payload: Record<string, any> = {
      entityType: params.entityType,
      eventType: params.eventType,
      timestamp,
      context: params.context || {},
      data: { ...params.data },
    };

    // Strip excluded fields
    if (rule.excludeFields.length > 0) {
      for (const field of rule.excludeFields) {
        delete payload.data[field];
      }
    }

    return payload;
  }

  /**
   * Test a publish rule by sending a sample message.
   * Returns the result including the topic, payload, and any errors.
   */
  async testPublishRule(ruleId: string): Promise<{
    success: boolean;
    topic: string | null;
    payload: Record<string, any> | null;
    brokerResults: Array<{
      brokerId: string;
      success: boolean;
      error?: string;
    }>;
    error?: string;
  }> {
    try {
      // Load the rule with brokers
      const rule = await this.prisma.mqttEventPublishRule.findUnique({
        where: { id: ruleId },
        include: { brokers: true },
      });

      if (!rule) {
        return {
          success: false,
          topic: null,
          payload: null,
          brokerResults: [],
          error: `Rule not found: ${ruleId}`,
        };
      }

      // Generate sample data based on entity type
      const sampleData = this.generateSampleData(rule.entityType);
      const sampleContext = {
        severity: "Info",
        phase: "Mashing",
        assetId: "TEST-ASSET-001",
        area: "test",
      };

      // Resolve topic
      const topic = resolveTopicTemplate(
        rule.topicTemplate,
        rule.entityType,
        rule.eventType === "*" ? "test_event" : rule.eventType,
        sampleData,
        sampleContext
      );

      // Shape payload
      const payload = this.shapePayload(rule as RuleWithBrokers, {
        entityType: rule.entityType,
        eventType: rule.eventType === "*" ? "test_event" : rule.eventType,
        data: sampleData,
        context: sampleContext,
      });

      // Add test indicator
      payload._isTest = true;
      payload._testTimestamp = new Date().toISOString();

      const message = JSON.stringify(payload);
      const brokerResults: Array<{
        brokerId: string;
        success: boolean;
        error?: string;
      }> = [];

      // Publish to each broker
      if (rule.brokers.length === 0) {
        return {
          success: false,
          topic,
          payload,
          brokerResults: [],
          error: "No brokers configured for this rule",
        };
      }

      for (const broker of rule.brokers) {
        try {
          const isConnected = this.mqttService.isBrokerConnected(broker.id);
          if (!isConnected) {
            brokerResults.push({
              brokerId: broker.id,
              success: false,
              error: "Broker not connected",
            });
            continue;
          }

          await this.mqttService.publish(broker.id, topic, message, {
            qos: rule.qos,
            retain: false, // Never retain test messages
          });

          brokerResults.push({
            brokerId: broker.id,
            success: true,
          });

          this.logger.log(
            `Test message published to ${topic} on broker ${broker.id}`
          );
        } catch (publishError) {
          brokerResults.push({
            brokerId: broker.id,
            success: false,
            error:
              publishError instanceof Error
                ? publishError.message
                : String(publishError),
          });
        }
      }

      const allSucceeded = brokerResults.every((r) => r.success);
      const anySucceeded = brokerResults.some((r) => r.success);

      return {
        success: anySucceeded,
        topic,
        payload,
        brokerResults,
        error: allSucceeded
          ? undefined
          : "Some brokers failed - see brokerResults for details",
      };
    } catch (error) {
      this.logger.error(`Test publish rule failed: ${error}`);
      return {
        success: false,
        topic: null,
        payload: null,
        brokerResults: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private generateSampleData(entityType: string): Record<string, any> {
    const baseData = {
      id: `TEST-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    switch (entityType) {
      case "ScheduleOrder":
        return {
          ...baseData,
          batchId: "BATCH-TEST-001",
          status: "InProgress",
          orderIndex: 1,
          mashbill: "Test Mashbill",
          grainLoad: 1000,
        };
      case "ProductionEvent":
        return {
          ...baseData,
          eventType: "sample_measurement",
          value: 42.5,
          unit: "units",
          assetId: "TEST-ASSET-001",
        };
      case "BatchDeviation":
        return {
          ...baseData,
          batchId: "BATCH-TEST-001",
          severity: "Minor",
          deviationType: "Test Deviation",
          description: "This is a test deviation",
        };
      case "StepExecution":
        return {
          ...baseData,
          batchId: "BATCH-TEST-001",
          stepName: "Test Step",
          state: "Running",
          phase: "Mashing",
        };
      case "ProductionOrder":
        return {
          ...baseData,
          orderNumber: "PO-TEST-001",
          status: "Active",
          quantity: 100,
        };
      case "MashingExecution":
        return {
          ...baseData,
          batchId: "BATCH-TEST-001",
          protocolName: "Test Protocol",
          currentStep: 1,
          totalSteps: 5,
        };
      default:
        return baseData;
    }
  }
}
