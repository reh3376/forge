import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UnsConfigurationModuleBase } from "./base/unsConfiguration.module.base";
import { UnsConfigurationService } from "./unsConfiguration.service";
import { UnsConfigurationController } from "./unsConfiguration.controller";
import { UnsConfigurationResolver } from "./unsConfiguration.resolver";

@Module({
  imports: [UnsConfigurationModuleBase, forwardRef(() => AuthModule)],
  controllers: [UnsConfigurationController],
  providers: [UnsConfigurationService, UnsConfigurationResolver],
  exports: [UnsConfigurationService],
})
export class UnsConfigurationModule {}
