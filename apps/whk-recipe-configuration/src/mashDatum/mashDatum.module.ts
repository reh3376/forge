import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MashDatumModuleBase } from "./base/mashDatum.module.base";
import { MashDatumService } from "./mashDatum.service";
import { MashDatumController } from "./mashDatum.controller";
import { MashDatumResolver } from "./mashDatum.resolver";

@Module({
  imports: [MashDatumModuleBase, forwardRef(() => AuthModule)],
  controllers: [MashDatumController],
  providers: [MashDatumService, MashDatumResolver],
  exports: [MashDatumService],
})
export class MashDatumModule {}
