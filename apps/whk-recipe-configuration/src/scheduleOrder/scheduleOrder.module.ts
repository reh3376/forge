import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScheduleOrderModuleBase } from "./base/scheduleOrder.module.base";
import { ScheduleOrderService } from "./scheduleOrder.service";
import { ScheduleOrderController } from "./scheduleOrder.controller";
import { ScheduleOrderResolver } from "./scheduleOrder.resolver";

@Module({
  imports: [ScheduleOrderModuleBase, forwardRef(() => AuthModule)],
  controllers: [ScheduleOrderController],
  providers: [ScheduleOrderService, ScheduleOrderResolver],
  exports: [ScheduleOrderService],
})
export class ScheduleOrderModule {}
