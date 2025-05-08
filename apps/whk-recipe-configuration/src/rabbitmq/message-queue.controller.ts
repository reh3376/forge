import { Controller, Post, Body, Logger } from "@nestjs/common";
import { MessageQueueService } from "./message-queue.service";

interface AcknowledgeMessageDto {
  messageId: string;
}

@Controller("message-queue")
export class MessageQueueController {
  private readonly logger = new Logger(MessageQueueController.name);

  constructor(private readonly messageQueueService: MessageQueueService) {}

  @Post("acknowledge")
  async acknowledgeMessage(@Body() dto: AcknowledgeMessageDto) {
    this.logger.log(`Acknowledging message ${dto.messageId}`);
    const result = await this.messageQueueService.acknowledgeMessage(
      dto.messageId
    );
    return { success: result };
  }
}
