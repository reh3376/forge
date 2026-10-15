/**
 * Seed default MQTT event publish rules.
 * All rules created disabled by default — admin enables via GraphQL or REST.
 *
 * Usage:
 *   npx ts-node scripts/seed/mqtt-publish-rules.seed.ts
 */
import { PrismaClient, EnumPayloadMode } from "@prisma/client";

const prisma = new PrismaClient();

const defaultRules = [
  {
    name: "All schedule order events",
    description: "Publishes every schedule order domain event to MQTT",
    entityType: "ScheduleOrder",
    eventType: "*",
    topicTemplate: "whk/mes/{area}/scheduleorder/{eventType}",
    payloadMode: EnumPayloadMode.Full,
    qos: 1,
    retain: false,
    enabled: false,
    priority: 0,
  },
  {
    name: "Cook completions",
    description: "Publishes cook completion events with minimal payload",
    entityType: "ScheduleOrder",
    eventType: "cook_complete",
    topicTemplate: "whk/mes/{area}/scheduleorder/{id}/cook_complete",
    payloadMode: EnumPayloadMode.EventOnly,
    qos: 1,
    retain: false,
    enabled: false,
    priority: 10,
  },
  {
    name: "Critical deviations",
    description: "Publishes critical batch deviations with full detail",
    entityType: "BatchDeviation",
    eventType: "deviation_recorded",
    severityFilter: ["Critical"],
    topicTemplate: "whk/mes/{area}/deviation/{severity}/{batchId}",
    payloadMode: EnumPayloadMode.Full,
    qos: 2,
    retain: false,
    enabled: false,
    priority: 20,
  },
  {
    name: "Production events (all)",
    description: "Publishes all production event types",
    entityType: "ProductionEvent",
    eventType: "*",
    topicTemplate: "whk/mes/{area}/{asset}/event/{eventType}",
    payloadMode: EnumPayloadMode.Full,
    qos: 0,
    retain: false,
    enabled: false,
    priority: 0,
  },
  {
    name: "Step execution state changes",
    description: "Publishes S88 step execution state transitions",
    entityType: "StepExecution",
    eventType: "*",
    topicTemplate: "whk/mes/{area}/execution/step/{eventType}",
    payloadMode: EnumPayloadMode.EventOnly,
    qos: 1,
    retain: false,
    enabled: false,
    priority: 0,
  },
];

async function seed() {
  console.log("Seeding MQTT event publish rules...");

  for (const rule of defaultRules) {
    const existing = await prisma.mqttEventPublishRule.findFirst({
      where: { name: rule.name },
    });

    if (existing) {
      console.log(`  Skipping "${rule.name}" (already exists)`);
      continue;
    }

    await prisma.mqttEventPublishRule.create({
      data: {
        ...rule,
        severityFilter: (rule as any).severityFilter || [],
        phaseFilter: [],
        assetFilter: [],
        includeRelations: [],
        excludeFields: [],
        createdBy: "seed",
      },
    });
    console.log(`  Created "${rule.name}"`);
  }

  console.log("Done.");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
