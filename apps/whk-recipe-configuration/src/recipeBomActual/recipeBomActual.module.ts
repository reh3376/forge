import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeBomActualModuleBase } from "./base/recipeBomActual.module.base";
import { RecipeBomActualService } from "./recipeBomActual.service";
import { RecipeBomActualController } from "./recipeBomActual.controller";
import { RecipeBomActualResolver } from "./recipeBomActual.resolver";
import { ScheduleOrderRecipeInstanceModule } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    RecipeBomActualModuleBase,
    forwardRef(() => AuthModule),
    forwardRef(() => ScheduleOrderRecipeInstanceModule),
    AuditModule,
  ],
  controllers: [RecipeBomActualController],
  providers: [RecipeBomActualService, RecipeBomActualResolver],
  exports: [RecipeBomActualService],
})
export class RecipeBomActualModule {}
