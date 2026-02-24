import { Global, Module } from "@nestjs/common";
import { MqttDomainPublisherService } from "./mqttDomainPublisher.service";
import { PrismaModule } from "../prisma/prisma.module";
import { MqttModule } from "../providers/mqtt/mqtt.module";

@Global()
@Module({
  imports: [PrismaModule, MqttModule],
  providers: [MqttDomainPublisherService],
  exports: [MqttDomainPublisherService],
})
export class MqttDomainPublisherModule {}
