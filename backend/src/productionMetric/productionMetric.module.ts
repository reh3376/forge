import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProductionMetricService } from "./productionMetric.service";
import { ProductionMetricResolver } from "./productionMetric.resolver";

@Module({
  imports: [PrismaModule],
  providers: [ProductionMetricService, ProductionMetricResolver],
  exports: [ProductionMetricService],
})
export class ProductionMetricModule {}
