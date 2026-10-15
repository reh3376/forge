import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MashingProtocolModuleBase } from "./base/mashingProtocol.module.base";
import { MashingProtocolService } from "./mashingProtocol.service";
import { MashingProtocolController } from "./mashingProtocol.controller";
import { MashingProtocolResolver } from "./mashingProtocol.resolver";

@Module({
  imports: [MashingProtocolModuleBase, forwardRef(() => AuthModule)],
  controllers: [MashingProtocolController],
  providers: [MashingProtocolService, MashingProtocolResolver],
  exports: [MashingProtocolService],
})
export class MashingProtocolModule {}
