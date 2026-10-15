import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScheduleOrderModuleBase } from "./base/scheduleOrder.module.base";
import { ScheduleOrderService } from "./scheduleOrder.service";
import { ScheduleOrderController } from "./scheduleOrder.controller";
import { ScheduleOrderResolver } from "./scheduleOrder.resolver";
import { ScheduleOrderGroupingService } from "./schedule-order-grouping.service";
import { OrderValidationModule } from "../order-validation/order-validation.module";
import { ScheduleOrderRecipeInstanceModule } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";
import { RecipeBomModule } from "../recipeBom/recipeBom.module";
import { AuditModule } from "../audit/audit.module";
import { YieldEstimationModule } from "../yieldEstimation/yieldEstimation.module";

@Module({
  imports: [
    ScheduleOrderModuleBase,
    forwardRef(() => AuthModule),
    OrderValidationModule,
    forwardRef(() => ScheduleOrderRecipeInstanceModule),
    RecipeBomModule,
    AuditModule,
    YieldEstimationModule,
  ],
  controllers: [ScheduleOrderController],
  providers: [
    ScheduleOrderService,
    ScheduleOrderResolver,
    ScheduleOrderGroupingService,
  ],
  exports: [ScheduleOrderService, ScheduleOrderGroupingService],
})
export class ScheduleOrderModule {}
