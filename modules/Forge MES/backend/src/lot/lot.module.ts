import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LotModuleBase } from "./base/lot.module.base";
import { LotService } from "./lot.service";
import { LotController } from "./lot.controller";
import { LotResolver } from "./lot.resolver";
import { WhiskeyTypeModule } from "../whiskeyType/whiskeyType.module";

@Module({
  imports: [LotModuleBase, forwardRef(() => AuthModule), WhiskeyTypeModule],
  controllers: [LotController],
  providers: [LotService, LotResolver],
  exports: [LotService],
})
export class LotModule {}
