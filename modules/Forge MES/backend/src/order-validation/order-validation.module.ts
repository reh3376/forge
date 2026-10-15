import { Module } from "@nestjs/common";
import { OrderValidationService } from "./order-validation.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ContainerItemService } from "../productionOrder/container-item.service";

@Module({
  imports: [PrismaModule],
  providers: [OrderValidationService, ContainerItemService],
  exports: [OrderValidationService, ContainerItemService],
})
export class OrderValidationModule {}
