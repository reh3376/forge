import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SeparationEventService } from "./separationEvent.service";
import { SeparationEventResolver } from "./separationEvent.resolver";
import { ScheduleOrderRecipeInstanceModule } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    ScheduleOrderRecipeInstanceModule,
  ],
  providers: [SeparationEventService, SeparationEventResolver],
  exports: [SeparationEventService],
})
export class SeparationEventModule {}
