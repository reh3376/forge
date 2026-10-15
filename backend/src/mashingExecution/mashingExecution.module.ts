import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ACLModule } from "../auth/acl.module";
import { AuthModule } from "../auth/auth.module";
import { MashingExecutionService } from "./mashingExecution.service";
import { MashingExecutionResolver } from "./mashingExecution.resolver";
import { StepExecutionModule } from "../stepExecution/stepExecution.module";
import { BatchDeviationModule } from "../batchDeviation/batchDeviation.module";
import { BatchModule } from "../batch/batch.module";
import { MashingStepParameterModule } from "../mashingStepParameter/mashingStepParameter.module";

@Module({
  imports: [
    PrismaModule,
    ACLModule,
    AuthModule,
    StepExecutionModule,
    BatchDeviationModule,
    BatchModule,
    MashingStepParameterModule,
  ],
  providers: [MashingExecutionService, MashingExecutionResolver],
  exports: [MashingExecutionService],
})
export class MashingExecutionModule {}
