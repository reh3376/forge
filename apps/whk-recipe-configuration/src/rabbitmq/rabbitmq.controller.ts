import {
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
  RmqContext,
} from "@nestjs/microservices";
import { RabbitMQMessage } from "./RabbitMQMessage";
import { Controller, Inject, Logger } from "@nestjs/common";
import { SyncService } from "../sync/sync.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { MessageQueueService } from "./message-queue.service";

interface AcknowledgementMessage {
  messageId: string;
  status: "success" | "error";
  errorDetails?: string;
}

@Controller("rabbitmq-controller")
export class RabbitMQController {
  constructor(
    private readonly syncService: SyncService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly messageQueueService: MessageQueueService
  ) {}

  private extractDataFromMessage(message: RabbitMQMessage): any {
    let data;

    if (typeof message === "string") {
      data = JSON.parse(message);
    } else if (Buffer.isBuffer(message)) {
      data = JSON.parse(message.toString());
    } else if (typeof message === "object") {
      data = message;
    } else {
      this.logger.error(`Unsupported message type: ${typeof message}`);
      throw new Error("Unsupported message type");
    }

    return data;
  }

  async processEvent(
    message: RabbitMQMessage,
    context: RmqContext
  ): Promise<void> {
    this.logger.log(
      `Event Received for record Name ${JSON.stringify(
        message.data.recordName
      )}`
    );
    // try {
    const eventType: string = message.data.event_type;
    if (eventType === "create") {
      await this.syncService.upsertEntity(
        message.data.recordName,
        message,
        "create"
      );
      return;
    } else if (eventType === "update") {
      await this.syncService.upsertEntity(
        message.data.recordName,
        message,
        "update"
      );
      return;
    }
  }

  @EventPattern("wh.whk01.distillery01.asset")
  async onWhWhk01Distillery01Asset(
    @Payload()
    message: RabbitMQMessage,
    @Ctx()
    context: RmqContext
  ): Promise<void> {
    this.logger.debug("Received event", message);
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

  // @EventPattern("wh.whk01.distillery01.bomitem")
  // async onWhWhk01Distillery01BomItem(
  //     @Payload()
  //         message: RabbitMQMessage,
  //     @Ctx()
  //         context: RmqContext
  // ): Promise<void> {
  //   await this.processEvent(message, context);
  // }

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

  @EventPattern("message_acknowledgment")
  async handleAcknowledgment(
    @Payload() message: any,
    @Ctx() context: RmqContext
  ) {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();

    // Extract the data from the nested structure - safely handle different message formats
    let messageId: string | undefined;
    let status: string | undefined;

    try {
      // Try multiple places where messageId might be found
      if (typeof message === "object" && message !== null) {
        // Case 1: Direct message format { messageId: 'xxx', status: 'xxx' }
        if ("messageId" in message) {
          messageId = message.messageId;
          status = message.status;
        }

        // Case 2: Nested in data property { data: { messageId: 'xxx', status: 'xxx' } }
        else if (
          "data" in message &&
          typeof message.data === "object" &&
          message.data !== null
        ) {
          messageId = message.data.messageId;
          status = message.data.status;
        }
      }

      // If not found in payload, try headers
      if (!messageId && originalMessage?.properties?.headers?.messageId) {
        messageId = originalMessage.properties.headers.messageId;
      }

      this.logger.log(
        `Received acknowledgment with message ID: ${
          messageId || "MISSING"
        } and status: ${status || "UNKNOWN"}`
      );

      if (!messageId) {
        this.logger.error(
          `Invalid acknowledgment format: missing messageId`,
          JSON.stringify(message)
        );
        console.log(
          `DEBUG: Original message properties:`,
          originalMessage?.properties
        );
        // Still ack the RabbitMQ message to prevent it being requeued
        channel.ack(originalMessage);
        return;
      }

      if (status === "success") {
        this.logger.log(`Attempting to acknowledge message ID: ${messageId}`);
        const messageExists = await this.messageQueueService.messageExists(
          messageId
        );

        if (!messageExists) {
          this.logger.warn(`Message ID ${messageId} not found in the database`);
          console.log(
            `DEBUG: Message ID ${messageId} not found in the database`
          );
        } else {
          this.logger.log(
            `Message found in DB with status: ${messageExists.status}`
          );
        }

        const result = await this.messageQueueService.acknowledgeMessage(
          messageId
        );
        this.logger.log(
          `Message ${messageId} acknowledgment result: ${
            result ? "success" : "failed"
          }`
        );
      } else {
        // Handle error acknowledgment
        this.logger.error(
          `Message ${messageId} reported error: ${
            message?.data?.errorDetails || "No details provided"
          }`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing acknowledgment: ${errorMessage}`);
      this.logger.error(
        `Message payload was: ${JSON.stringify(message, null, 2)}`
      );
    } finally {
      // Always acknowledge the RabbitMQ message to prevent it from being requeued
      channel.ack(originalMessage);
    }
  }

  @MessagePattern("sync")
  async handleSync(
    @Payload() data: RabbitMQMessage,
    @Ctx() context: RmqContext
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      this.logger.debug(`Received sync message: ${JSON.stringify(data)}`);

      // Extract data from the message payload if needed
      const payload = this.extractDataFromMessage(data);

      if (payload.entity_type) {
        const result = await this.syncService.upsertEntity(
          payload.entity_type,
          payload,
          payload.action || "update"
        );

        // Acknowledge the message
        channel.ack(message);
        return result;
      } else {
        this.logger.warn(
          `Sync message missing entity_type: ${JSON.stringify(payload)}`
        );
        channel.ack(message); // Still acknowledge to avoid blocking the queue
      }
    } catch (error) {
      this.logger.error(`Error processing sync message: ${error}`);
      // Negative acknowledge the message so it can be retried
      channel.nack(message);
    }
  }
}
