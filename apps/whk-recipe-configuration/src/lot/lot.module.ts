import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LotModuleBase } from "./base/lot.module.base";
import { LotService } from "./lot.service";
import { LotController } from "./lot.controller";
import { LotResolver } from "./lot.resolver";

@Module({
  imports: [LotModuleBase, forwardRef(() => AuthModule)],
  controllers: [LotController],
  providers: [LotService, LotResolver],
  exports: [LotService],
})
export class LotModule {}
