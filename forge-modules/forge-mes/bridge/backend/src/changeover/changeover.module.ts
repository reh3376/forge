import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { ScheduleOrderModule } from "../scheduleOrder/scheduleOrder.module";
import { ScheduleOrderQueueModule } from "../scheduleOrderQueue/scheduleOrderQueue.module";
import { ScheduleOrderRecipeInstanceModule } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";
import { MqttModule } from "../providers/mqtt/mqtt.module";
import { AuditModule } from "../audit/audit.module";
import { ChangeoverController } from "./changeover.controller";
import { ChangeoverForgeWriteTarget } from "./changeover.forge-write";
import { ChangeoverService } from "./changeover.service";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ScheduleOrderModule),
    forwardRef(() => ScheduleOrderQueueModule),
    ScheduleOrderRecipeInstanceModule,
    MqttModule,
    AuditModule,
  ],
  controllers: [ChangeoverController],
  // ChangeoverForgeWriteTarget registers the mes.changeover.* write tags with
  // the global ForgeModule so the hub can drive this state machine (FB-054).
  providers: [ChangeoverService, ChangeoverForgeWriteTarget],
  exports: [ChangeoverService],
})
export class ChangeoverModule {}
