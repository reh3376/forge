import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MashingDatumModuleBase } from "./base/mashingDatum.module.base";
import { MashingDatumService } from "./mashingDatum.service";
import { MashingDatumController } from "./mashingDatum.controller";
import { MashingDatumResolver } from "./mashingDatum.resolver";

@Module({
  imports: [MashingDatumModuleBase, forwardRef(() => AuthModule)],
  controllers: [MashingDatumController],
  providers: [MashingDatumService, MashingDatumResolver],
  exports: [MashingDatumService],
})
export class MashingDatumModule {}
