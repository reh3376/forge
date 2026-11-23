import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { MqttService } from "./mqtt.service";
import { MqttWebSocketGateway } from "./mqtt-websocket.gateway";
import { MqttController } from "./mqtt.controller";
import { CertificateRotationService } from "./certificateRotation.service";
import { CertificateRotationController } from "./certificateRotation.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { UserModule } from "../../user/user.module";
import { WebSocketAuthGuard } from "../../auth/websocket-auth.guard";
import { SecretsManagerModule } from "../secrets/secretsManager.module";

@Module({
  imports: [
    PrismaModule,
    UserModule,
    SecretsManagerModule,
    ScheduleModule.forRoot(), // Required for @Cron decorators
    JwtModule, // Will use the globally configured JWT module
  ],
  controllers: [MqttController, CertificateRotationController],
  providers: [
    MqttService,
    MqttWebSocketGateway,
    CertificateRotationService,
    WebSocketAuthGuard,
  ],
  exports: [MqttService, MqttWebSocketGateway, CertificateRotationService],
})
export class MqttModule {}
