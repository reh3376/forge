import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MashingStepParameterService } from "./mashingStepParameter.service";
import { MashingStepParameterResolver } from "./mashingStepParameter.resolver";

@Module({
  imports: [PrismaModule],
  providers: [MashingStepParameterService, MashingStepParameterResolver],
  exports: [MashingStepParameterService],
})
export class MashingStepParameterModule {}
