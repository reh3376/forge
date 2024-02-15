import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateClientOptions } from "./mqtt/generateClientOptions";
import { MicroserviceOptions } from "@nestjs/microservices";
import { generateKafkaClientOptions } from "./kafka/generateKafkaClientOptions";

export async function connectMicroservices(app: INestApplication) {
  const configService = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>(generateClientOptions(configService));
  app.connectMicroservice<MicroserviceOptions>(generateKafkaClientOptions(configService));
}
