import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionOrderQueueModuleBase } from "./base/productionOrderQueue.module.base";
import { ProductionOrderQueueService } from "./productionOrderQueue.service";
import { ProductionOrderQueueController } from "./productionOrderQueue.controller";
import { ProductionOrderQueueResolver } from "./productionOrderQueue.resolver";

@Module({
  imports: [ProductionOrderQueueModuleBase, forwardRef(() => AuthModule)],
  controllers: [ProductionOrderQueueController],
  providers: [ProductionOrderQueueService, ProductionOrderQueueResolver],
  exports: [ProductionOrderQueueService],
})
export class ProductionOrderQueueModule {}
