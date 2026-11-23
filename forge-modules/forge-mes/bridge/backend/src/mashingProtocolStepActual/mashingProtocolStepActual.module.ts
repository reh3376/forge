import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MashingProtocolStepActualModuleBase } from "./base/mashingProtocolStepActual.module.base";
import { MashingProtocolStepActualService } from "./mashingProtocolStepActual.service";
import { MashingProtocolStepActualController } from "./mashingProtocolStepActual.controller";
import { MashingProtocolStepActualResolver } from "./mashingProtocolStepActual.resolver";

@Module({
  imports: [MashingProtocolStepActualModuleBase, forwardRef(() => AuthModule)],
  controllers: [MashingProtocolStepActualController],
  providers: [
    MashingProtocolStepActualService,
    MashingProtocolStepActualResolver,
  ],
  exports: [MashingProtocolStepActualService],
})
export class MashingProtocolStepActualModule {}
