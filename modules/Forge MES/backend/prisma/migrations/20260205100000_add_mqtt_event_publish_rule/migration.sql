-- MQTT Domain Event Publishing - MqttEventPublishRule
-- Configuration-driven rules for publishing domain events to MQTT brokers

-- ============================================
-- PAYLOAD MODE ENUM
-- ============================================
CREATE TYPE "EnumPayloadMode" AS ENUM ('Full', 'EventOnly', 'Custom');

-- ============================================
-- MQTT EVENT PUBLISH RULE TABLE
-- ============================================
CREATE TABLE "MqttEventPublishRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    "name" TEXT NOT NULL,
    "description" TEXT,

    -- Matching: what triggers this rule
    "entityType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severityFilter" TEXT[],
    "phaseFilter" TEXT[],
    "assetFilter" TEXT[],

    -- Topic: where to publish
    "topicTemplate" TEXT NOT NULL,

    -- Payload: what to publish
    "payloadMode" "EnumPayloadMode" NOT NULL DEFAULT 'Full',
    "includeRelations" TEXT[],
    "excludeFields" TEXT[],
    "payloadTransform" JSONB,

    -- MQTT options
    "qos" INTEGER NOT NULL DEFAULT 1,
    "retain" BOOLEAN NOT NULL DEFAULT false,

    -- State
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MqttEventPublishRule_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- MANY-TO-MANY: MqttEventPublishRule <-> UnsBrokerConfiguration
-- ============================================
CREATE TABLE "_MqttEventPublishRuleToUnsBrokerConfiguration" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MqttEventPublishRuleToUnsBrokerConfiguration_AB_pkey" PRIMARY KEY ("A", "B")
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX "MqttEventPublishRule_entityType_eventType_idx" ON "MqttEventPublishRule"("entityType", "eventType");
CREATE INDEX "MqttEventPublishRule_enabled_idx" ON "MqttEventPublishRule"("enabled");
CREATE INDEX "_MqttEventPublishRuleToUnsBrokerConfiguration_B_index" ON "_MqttEventPublishRuleToUnsBrokerConfiguration"("B");

-- ============================================
-- FOREIGN KEYS
-- ============================================
ALTER TABLE "_MqttEventPublishRuleToUnsBrokerConfiguration"
    ADD CONSTRAINT "_MqttEventPublishRuleToUnsBrokerConfiguration_A_fkey"
    FOREIGN KEY ("A") REFERENCES "MqttEventPublishRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_MqttEventPublishRuleToUnsBrokerConfiguration"
    ADD CONSTRAINT "_MqttEventPublishRuleToUnsBrokerConfiguration_B_fkey"
    FOREIGN KEY ("B") REFERENCES "UnsBrokerConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
