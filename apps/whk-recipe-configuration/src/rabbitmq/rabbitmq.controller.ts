import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { RabbitMQMessage } from "./RabbitMQMessage";
import { Controller, Logger } from "@nestjs/common";

@Controller("rabbitmq-controller")
export class RabbitMQController {
  private readonly logger = new Logger(RabbitMQController.name);

  @EventPattern("wh.whk01.distillery01.asset")
  async onWhWhk01Distillery01Asset(
    @Payload()
    message: RabbitMQMessage,
    @Ctx()
    context: RmqContext
  ): Promise<void> {}

  @EventPattern("wh.whk01.distillery01.item")
  async onWhWhk01Distillery01Item(
    @Payload()
    message: RabbitMQMessage,
    @Ctx()
    context: RmqContext
  ): Promise<void> {}
}
