-- CreateTable
CREATE TABLE "MqttMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "qos" INTEGER DEFAULT 0,
    "retain" BOOLEAN DEFAULT false,
    "messageId" TEXT,
    "brokerConfigurationId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "processed" BOOLEAN DEFAULT false,
    "processingError" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "tagName" TEXT,
    "numericValue" DOUBLE PRECISION,
    "stringValue" TEXT,
    "booleanValue" BOOLEAN,

    CONSTRAINT "MqttMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MqttTagMapping" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "tagPattern" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityField" TEXT,
    "transformationRule" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "brokerConfigurationId" TEXT,

    CONSTRAINT "MqttTagMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MqttMessage_messageId_key" ON "MqttMessage"("messageId");

-- CreateIndex
CREATE INDEX "MqttMessage_topic_idx" ON "MqttMessage"("topic");

-- CreateIndex
CREATE INDEX "MqttMessage_expiresAt_idx" ON "MqttMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "MqttMessage_entityType_entityId_idx" ON "MqttMessage"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "MqttMessage_tagName_idx" ON "MqttMessage"("tagName");

-- CreateIndex
CREATE INDEX "MqttTagMapping_tagPattern_idx" ON "MqttTagMapping"("tagPattern");

-- CreateIndex
CREATE INDEX "MqttTagMapping_entityType_idx" ON "MqttTagMapping"("entityType");

-- CreateIndex
CREATE INDEX "MqttTagMapping_priority_idx" ON "MqttTagMapping"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "MqttTagMapping_tagPattern_entityType_entityField_key" ON "MqttTagMapping"("tagPattern", "entityType", "entityField");

-- AddForeignKey
ALTER TABLE "MqttMessage" ADD CONSTRAINT "MqttMessage_brokerConfigurationId_fkey" FOREIGN KEY ("brokerConfigurationId") REFERENCES "UnsBrokerConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MqttTagMapping" ADD CONSTRAINT "MqttTagMapping_brokerConfigurationId_fkey" FOREIGN KEY ("brokerConfigurationId") REFERENCES "UnsBrokerConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
