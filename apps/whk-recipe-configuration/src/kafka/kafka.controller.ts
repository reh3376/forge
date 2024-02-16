import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
} from "@nestjs/microservices";
import { Controller } from "@nestjs/common";

@Controller("kafka-controller")
export class KafkaController {
  @EventPattern("purchaseorder.create")
  async onPurchaseorderCreate(
    @Payload()
    value: string | Record<string, any> | null,
    @Ctx()
    context: KafkaContext
  ): Promise<void> {
    const message = context.getMessage();
  }
}
