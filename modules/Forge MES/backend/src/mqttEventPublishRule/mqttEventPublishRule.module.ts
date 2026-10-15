import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MqttEventPublishRuleService } from "./mqttEventPublishRule.service";
import { MqttEventPublishRuleResolver } from "./mqttEventPublishRule.resolver";
import { MqttEventPublishRuleController } from "./mqttEventPublishRule.controller";

@Module({
  imports: [PrismaModule],
  controllers: [MqttEventPublishRuleController],
  providers: [MqttEventPublishRuleService, MqttEventPublishRuleResolver],
  exports: [MqttEventPublishRuleService],
})
export class MqttEventPublishRuleModule {}
