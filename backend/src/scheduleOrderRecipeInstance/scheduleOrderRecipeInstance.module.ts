import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { RecipeBomModule } from "../recipeBom/recipeBom.module";
import { ProductionEventModule } from "../productionEvent/productionEvent.module";
import { BatchDeviationModule } from "../batchDeviation/batchDeviation.module";
import { ScheduleOrderRecipeInstanceService } from "./scheduleOrderRecipeInstance.service";
import { ScheduleOrderRecipeInstanceResolver } from "./scheduleOrderRecipeInstance.resolver";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    RecipeBomModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ProductionEventModule),
    forwardRef(() => BatchDeviationModule),
  ],
  providers: [
    ScheduleOrderRecipeInstanceService,
    ScheduleOrderRecipeInstanceResolver,
  ],
  exports: [ScheduleOrderRecipeInstanceService],
})
export class ScheduleOrderRecipeInstanceModule {}
