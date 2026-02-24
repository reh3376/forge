/**
 * Seed MQTT broker configuration and publish rules.
 *
 * This script sets up:
 * 1. A local Mosquitto broker configuration (whk-mqtt-broker on port 1884)
 * 2. Default publish rules connected to the broker
 *
 * Usage:
 *   npx ts-node scripts/seed/seed-mqtt-config.ts
 */
import { PrismaClient, EnumPayloadMode } from "@prisma/client";

const prisma = new PrismaClient();

// Broker configuration for the local Mosquitto container
const brokerConfig = {
  host: "localhost",
  port: 1885, // Alternative port to avoid conflicts
  protocol: "mqtt://",
  username: null, // Anonymous auth for dev
  tls: false,
  validateCertificate: false,
  baseTopicPath: "whk/mes",
  subscriptions: ["whk/mes/#"],
  createdBy: "seed",
};

// Default publish rules - these will be connected to the broker
const defaultRules = [
  {
    name: "Schedule Order Status Changes",
    description:
      "Publishes schedule order status transitions (queued, in_progress, completed, etc.)",
    entityType: "ScheduleOrder",
    eventType: "status_change",
    topicTemplate: "whk/mes/production/scheduleorder/{id}/status",
    payloadMode: EnumPayloadMode.Full,
    qos: 1,
    retain: true, // Retain last status
    enabled: true,
    priority: 10,
  },
  {
    name: "Schedule Order All Events",
    description: "Publishes all schedule order domain events",
    entityType: "ScheduleOrder",
    eventType: "*",
    topicTemplate: "whk/mes/production/scheduleorder/{eventType}/{id}",
    payloadMode: EnumPayloadMode.Full,
    qos: 1,
    retain: false,
    enabled: true,
    priority: 0,
  },
  {
    name: "Cook Completions",
    description: "Publishes cook completion events with timing data",
    entityType: "ScheduleOrder",
    eventType: "cook_complete",
    topicTemplate: "whk/mes/production/cook/{id}/complete",
    payloadMode: EnumPayloadMode.EventOnly,
    qos: 1,
    retain: false,
    enabled: true,
    priority: 20,
  },
  {
    name: "Production Events",
    description:
      "Publishes all production events (samples, measurements, etc.)",
    entityType: "ProductionEvent",
    eventType: "*",
    topicTemplate: "whk/mes/production/event/{eventType}/{id}",
    payloadMode: EnumPayloadMode.Full,
    qos: 0,
    retain: false,
    enabled: true,
    priority: 0,
  },
  {
    name: "Critical Batch Deviations",
    description: "Publishes critical severity batch deviations immediately",
    entityType: "BatchDeviation",
    eventType: "*",
    severityFilter: ["Critical"],
    topicTemplate: "whk/mes/alerts/deviation/critical/{batchId}",
    payloadMode: EnumPayloadMode.Full,
    qos: 2, // Exactly once for critical alerts
    retain: false,
    enabled: true,
    priority: 100, // Highest priority
  },
  {
    name: "All Batch Deviations",
    description: "Publishes all batch deviations",
    entityType: "BatchDeviation",
    eventType: "*",
    topicTemplate: "whk/mes/production/deviation/{severity}/{batchId}",
    payloadMode: EnumPayloadMode.Full,
    qos: 1,
    retain: false,
    enabled: true,
    priority: 0,
  },
  {
    name: "Step Execution State Changes",
    description: "Publishes S88 step execution state transitions",
    entityType: "StepExecution",
    eventType: "*",
    topicTemplate: "whk/mes/execution/step/{batchId}/{stepName}/{state}",
    payloadMode: EnumPayloadMode.EventOnly,
    qos: 1,
    retain: false,
    enabled: true,
    priority: 0,
  },
  {
    name: "Production Order Updates",
    description: "Publishes production order status and updates",
    entityType: "ProductionOrder",
    eventType: "*",
    topicTemplate: "whk/mes/production/order/{eventType}/{id}",
    payloadMode: EnumPayloadMode.Full,
    qos: 1,
    retain: false,
    enabled: true,
    priority: 0,
  },
  {
    name: "Mashing Execution Events",
    description: "Publishes mashing protocol execution events",
    entityType: "MashingExecution",
    eventType: "*",
    topicTemplate: "whk/mes/execution/mashing/{eventType}/{id}",
    payloadMode: EnumPayloadMode.Full,
    qos: 1,
    retain: false,
    enabled: true,
    priority: 0,
  },
];

async function seed() {
  console.log("=".repeat(60));
  console.log("MQTT Configuration Seed");
  console.log("=".repeat(60));

  // 1. Create or update broker configuration
  console.log("\n[1/2] Seeding MQTT broker configuration...");

  let broker = await prisma.unsBrokerConfiguration.findFirst({
    where: { host: brokerConfig.host, port: brokerConfig.port },
  });

  if (broker) {
    console.log(
      `  Broker already exists: ${broker.host}:${broker.port} (id: ${broker.id})`
    );
  } else {
    broker = await prisma.unsBrokerConfiguration.create({
      data: brokerConfig,
    });
    console.log(
      `  Created broker: ${broker.host}:${broker.port} (id: ${broker.id})`
    );
  }

  // 2. Create publish rules connected to the broker
  console.log("\n[2/2] Seeding MQTT publish rules...");

  let created = 0;
  let skipped = 0;

  for (const rule of defaultRules) {
    const existing = await prisma.mqttEventPublishRule.findFirst({
      where: { name: rule.name },
    });

    if (existing) {
      console.log(`  [SKIP] "${rule.name}" (already exists)`);
      skipped++;
      continue;
    }

    await prisma.mqttEventPublishRule.create({
      data: {
        name: rule.name,
        description: rule.description,
        entityType: rule.entityType,
        eventType: rule.eventType,
        severityFilter: (rule as any).severityFilter || [],
        phaseFilter: [],
        assetFilter: [],
        topicTemplate: rule.topicTemplate,
        payloadMode: rule.payloadMode,
        includeRelations: [],
        excludeFields: [],
        qos: rule.qos,
        retain: rule.retain,
        enabled: rule.enabled,
        priority: rule.priority,
        createdBy: "seed",
        brokers: {
          connect: [{ id: broker.id }],
        },
      },
    });
    console.log(
      `  [NEW] "${rule.name}" (${rule.entityType}::${rule.eventType})`
    );
    created++;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Broker: ${broker.host}:${broker.port}`);
  console.log(`  Rules created: ${created}`);
  console.log(`  Rules skipped: ${skipped}`);
  console.log(`  Total rules: ${created + skipped}`);
  console.log("=".repeat(60));
  console.log("\nTo start the MQTT broker:");
  console.log("  docker-compose -f docker-compose.dev.yml up -d mosquitto");
  console.log("\nTo test publishing:");
  console.log('  mosquitto_sub -h localhost -p 1885 -t "whk/mes/#" -v');
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
