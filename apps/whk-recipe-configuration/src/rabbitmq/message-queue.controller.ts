import { Controller, Post, Body, Inject } from "@nestjs/common";
import { MessageQueueService } from "./message-queue.service";
import { Logger } from "winston";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

interface AcknowledgeMessageDto {
  messageId: string;
}

@Controller("message-queue")
export class MessageQueueController {
  constructor(
    private readonly messageQueueService: MessageQueueService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {}

  @Post("acknowledge")
  async acknowledgeMessage(@Body() dto: AcknowledgeMessageDto) {
    this.logger.debug(`Acknowledging message ${dto.messageId}`);
    const result = await this.messageQueueService.acknowledgeMessage(
      dto.messageId
    );
    return { success: result };
  }
}
