import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssetModuleBase } from "./base/asset.module.base";
import { AssetService } from "./asset.service";
import { AssetController } from "./asset.controller";
import { AssetResolver } from "./asset.resolver";

@Module({
  imports: [AssetModuleBase, forwardRef(() => AuthModule)],
  controllers: [AssetController],
  providers: [AssetService, AssetResolver],
  exports: [AssetService],
})
export class AssetModule {}
