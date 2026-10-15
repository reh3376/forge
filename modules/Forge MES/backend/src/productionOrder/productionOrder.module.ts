import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionOrderModuleBase } from "./base/productionOrder.module.base";
import { ProductionOrderService } from "./productionOrder.service";
import { ProductionOrderController } from "./productionOrder.controller";
import { ProductionOrderResolver } from "./productionOrder.resolver";
import { OrderValidationModule } from "../order-validation/order-validation.module";
import { ScheduleOrderModule } from "../scheduleOrder/scheduleOrder.module";

@Module({
  imports: [
    ProductionOrderModuleBase,
    forwardRef(() => AuthModule),
    OrderValidationModule,
    forwardRef(() => ScheduleOrderModule),
  ],
  controllers: [ProductionOrderController],
  providers: [ProductionOrderService, ProductionOrderResolver],
  exports: [ProductionOrderService],
})
export class ProductionOrderModule {}
