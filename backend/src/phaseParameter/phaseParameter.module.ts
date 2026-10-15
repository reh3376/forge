import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PhaseParameterModuleBase } from "./base/phaseParameter.module.base";
import { PhaseParameterService } from "./phaseParameter.service";
import { PhaseParameterController } from "./phaseParameter.controller";
import { PhaseParameterResolver } from "./phaseParameter.resolver";

@Module({
  imports: [PhaseParameterModuleBase, forwardRef(() => AuthModule)],
  controllers: [PhaseParameterController],
  providers: [PhaseParameterService, PhaseParameterResolver],
  exports: [PhaseParameterService],
})
export class PhaseParameterModule {}
