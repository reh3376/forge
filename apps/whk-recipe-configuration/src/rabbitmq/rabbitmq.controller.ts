import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { RabbitMQMessage } from "./RabbitMQMessage";
import {Controller} from "@nestjs/common";
import {SyncService} from "../sync/sync.service";
import {PinoLogger} from "nestjs-pino";

@Controller("rabbitmq-controller")
export class RabbitMQController {

  constructor(
      private readonly syncService: SyncService,
      private readonly logger: PinoLogger
  ) {}

  private extractDataFromMessage(message: RabbitMQMessage): any {
    let data;

    if (typeof message === 'string') {
      data = JSON.parse(message);
    } else if (Buffer.isBuffer(message)) {
      data = JSON.parse(message.toString());
    } else if (typeof message === 'object') {
      data = message;
    } else {
      this.logger.error(`Unsupported message type: ${typeof message}`)
      throw new Error('Unsupported message type');
    }

    return data;
  }
  
  async processEvent(
      message: RabbitMQMessage,
      context: RmqContext
  ): Promise<void> {
    this.logger.info(`Event Received for record Name ${JSON.stringify(message.data.recordName)}`);
    // try {
      const eventType: string = message.data.event_type;
      if (eventType === 'create') {
          await this.syncService.upsertEntity(message.data.recordName, message);
          return;
      } else if (eventType === 'update') {
          await this.syncService.upsertEntity(message.data.recordName, message);
          return;
      } else if (eventType === 'delete') {
          await this.syncService.deleteEntity(message.data.recordName, message);
          return;
      }
    // } catch (error) {
    //   this.logger.error(`Error handling event: ${error}`);
    // }
  }

  @EventPattern("wh.whk01.distillery01.asset")
  async onWhWhk01Distillery01Asset(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    this.logger.debug('Received event', message);
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

  @EventPattern("wh.whk01.distillery01.bomitem")
  async onWhWhk01Distillery01BomItem(
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

  @EventPattern("wh.whk01.distillery01.vendor")
  async onWhWhk01Distillery01Vendor(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }

  @EventPattern("wh.whk01.distillery01.customer")
  async onWhWhk01Distillery01Customer(
      @Payload()
          message: RabbitMQMessage,
      @Ctx()
          context: RmqContext
  ): Promise<void> {
    await this.processEvent(message, context);
  }
}
