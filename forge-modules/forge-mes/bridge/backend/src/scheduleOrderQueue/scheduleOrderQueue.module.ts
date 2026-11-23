import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScheduleOrderQueueModuleBase } from "./base/scheduleOrderQueue.module.base";
import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";
import { ScheduleOrderQueueController } from "./scheduleOrderQueue.controller";
import { ScheduleOrderQueueResolver } from "./scheduleOrderQueue.resolver";
import { ProductionOrderRecipeInstanceModule } from "../productionOrderRecipeInstance/productionOrderRecipeInstance.module";
import { ScheduleOrderRecipeInstanceModule } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";
import { ScheduleOrderModule } from "../scheduleOrder/scheduleOrder.module";

@Module({
  imports: [
    ScheduleOrderQueueModuleBase,
    forwardRef(() => AuthModule),
    forwardRef(() => ScheduleOrderModule),
    ProductionOrderRecipeInstanceModule,
    ScheduleOrderRecipeInstanceModule,
  ],
  controllers: [ScheduleOrderQueueController],
  providers: [ScheduleOrderQueueService, ScheduleOrderQueueResolver],
  exports: [ScheduleOrderQueueService],
})
export class ScheduleOrderQueueModule {}
