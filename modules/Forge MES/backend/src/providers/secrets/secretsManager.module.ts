import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SecretsManagerService } from "./secretsManager.service";
import { SecretsManagerFactory } from "./secretsManagerFactory";
import { MqttSecretsService } from "./mqttSecrets.service";

@Module({
  imports: [ConfigModule],
  providers: [SecretsManagerFactory, SecretsManagerService, MqttSecretsService],
  exports: [SecretsManagerService, MqttSecretsService],
})
export class SecretsManagerModule {}
