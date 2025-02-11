import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateRabbitMQClientOptions } from "./rabbitmq/generateRabbitMQClientOptions";
import { MicroserviceOptions } from "@nestjs/microservices";
import { RabbitMQ } from "./rabbitmq/rabbitmq.transport";

export async function connectMicroservices(app: INestApplication) {
  const configService = app.get(ConfigService);

  const services = [
    "asset",
    "customer",
    "item",
    "bom",
    "bomitem",
    "vendor",
    "purchaseorder",
    "salesorder",
  ];

  services.forEach((service) => {
    app.connectMicroservice<MicroserviceOptions>({
      strategy: new RabbitMQ(
        generateRabbitMQClientOptions(
          configService,
          `wh.whk01.distillery01.${service}`
        ).options
      ),
    });
  });
}
