import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MashingProtocolStepModuleBase } from "./base/mashingProtocolStep.module.base";
import { MashingProtocolStepService } from "./mashingProtocolStep.service";
import { MashingProtocolStepController } from "./mashingProtocolStep.controller";
import { MashingProtocolStepResolver } from "./mashingProtocolStep.resolver";

@Module({
  imports: [MashingProtocolStepModuleBase, forwardRef(() => AuthModule)],
  controllers: [MashingProtocolStepController],
  providers: [MashingProtocolStepService, MashingProtocolStepResolver],
  exports: [MashingProtocolStepService],
})
export class MashingProtocolStepModule {}
