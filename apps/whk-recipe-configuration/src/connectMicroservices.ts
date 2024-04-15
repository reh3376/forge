import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateRabbitMQClientOptions } from "./rabbitmq/generateRabbitMQClientOptions";
import { MicroserviceOptions } from "@nestjs/microservices";
import { RabbitMQ } from "./rabbitmq/rabbitmq.transport";

export async function connectMicroservices(app: INestApplication) {
  const configService = app.get(ConfigService);
}
