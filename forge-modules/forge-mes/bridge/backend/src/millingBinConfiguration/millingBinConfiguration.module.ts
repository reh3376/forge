import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MillingBinConfigurationModuleBase } from "./base/millingBinConfiguration.module.base";
import { MillingBinConfigurationService } from "./millingBinConfiguration.service";
import { MillingBinConfigurationController } from "./millingBinConfiguration.controller";
import { MillingBinConfigurationResolver } from "./millingBinConfiguration.resolver";

@Module({
  imports: [MillingBinConfigurationModuleBase, forwardRef(() => AuthModule)],
  controllers: [MillingBinConfigurationController],
  providers: [MillingBinConfigurationService, MillingBinConfigurationResolver],
  exports: [MillingBinConfigurationService],
})
export class MillingBinConfigurationModule {}
