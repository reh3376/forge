import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionOrderModuleBase } from "./base/productionOrder.module.base";
import { ProductionOrderService } from "./productionOrder.service";
import { ProductionOrderController } from "./productionOrder.controller";
import { ProductionOrderResolver } from "./productionOrder.resolver";

@Module({
  imports: [ProductionOrderModuleBase, forwardRef(() => AuthModule)],
  controllers: [ProductionOrderController],
  providers: [ProductionOrderService, ProductionOrderResolver],
  exports: [ProductionOrderService],
})
export class ProductionOrderModule {}
