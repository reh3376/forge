import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProductionEventService } from "./productionEvent.service";

@Module({
  imports: [PrismaModule],
  providers: [ProductionEventService],
  exports: [ProductionEventService],
})
export class ProductionEventModule {}
