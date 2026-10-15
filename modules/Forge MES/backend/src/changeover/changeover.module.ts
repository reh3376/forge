import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { ScheduleOrderModule } from "../scheduleOrder/scheduleOrder.module";
import { ScheduleOrderQueueModule } from "../scheduleOrderQueue/scheduleOrderQueue.module";
import { ScheduleOrderRecipeInstanceModule } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";
import { MqttModule } from "../providers/mqtt/mqtt.module";
import { AuditModule } from "../audit/audit.module";
import { ChangeoverController } from "./changeover.controller";
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
  providers: [ChangeoverService],
  exports: [ChangeoverService],
})
export class ChangeoverModule {}
