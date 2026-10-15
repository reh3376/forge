import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ACLModule } from "../auth/acl.module";
import { AuthModule } from "../auth/auth.module";
import { ProductionEventModule } from "../productionEvent/productionEvent.module";
import { StepExecutionService } from "./stepExecution.service";
import { StepExecutionResolver } from "./stepExecution.resolver";

@Module({
  imports: [
    PrismaModule,
    ACLModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ProductionEventModule),
  ],
  providers: [StepExecutionService, StepExecutionResolver],
  exports: [StepExecutionService],
})
export class StepExecutionModule {}
