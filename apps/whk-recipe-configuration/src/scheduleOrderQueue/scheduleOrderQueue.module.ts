import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScheduleOrderQueueModuleBase } from "./base/scheduleOrderQueue.module.base";
import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";
import { ScheduleOrderQueueController } from "./scheduleOrderQueue.controller";
import { ScheduleOrderQueueResolver } from "./scheduleOrderQueue.resolver";

@Module({
  imports: [ScheduleOrderQueueModuleBase, forwardRef(() => AuthModule)],
  controllers: [ScheduleOrderQueueController],
  providers: [ScheduleOrderQueueService, ScheduleOrderQueueResolver],
  exports: [ScheduleOrderQueueService],
})
export class ScheduleOrderQueueModule {}
