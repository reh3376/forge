import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { RabbitMQMessage } from "./RabbitMQMessage";
import {Controller, LoggerService} from "@nestjs/common";
import {SyncService} from "../sync/sync.service";

@Controller("rabbitmq-controller")
export class RabbitMQController {
  constructor(
      private readonly syncService: SyncService,
      private readonly logger: LoggerService,
  ) {}

  async processEvent(
      message: RabbitMQMessage,
      context: RmqContext
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.syncService.upsertEntity(message.recordName, message)
      this.logger.log(`Processed ${message.recordName} event`)
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Error handling event: ${error}`);
      channel.ack(originalMsg);
    }
  }

  @EventPattern("wh.whk01.distillery01.asset")
  async onWhWhk01Distillery01Asset(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.item")
  async onWhWhk01Distillery01Item(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }
}
