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

  @EventPattern("wh.whk01.distillery01.itemgroup")
  async onWhWhk01Distillery01ItemGroup(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.purchaseorder")
  async onWhWhk01Distillery01Purchaseorder(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.productionorder")
  async onWhWhk01Distillery01Productionorder(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.salesorder")
  async onWhWhk01Distillery01Salesorder(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.account")
  async onWhWhk01Distillery01Account(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.bom")
  async onWhWhk01Distillery01Bom(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.recipe")
  async onWhWhk01Distillery01Recipe(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.barrel")
  async onWhWhk01Distillery01Barrel(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }
}
