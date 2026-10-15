import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UnsBrokerConfigurationModuleBase } from "./base/unsBrokerConfiguration.module.base";
import { UnsBrokerConfigurationService } from "./unsBrokerConfiguration.service";
import { UnsBrokerConfigurationController } from "./unsBrokerConfiguration.controller";
import { UnsBrokerConfigurationResolver } from "./unsBrokerConfiguration.resolver";

@Module({
  imports: [UnsBrokerConfigurationModuleBase, forwardRef(() => AuthModule)],
  controllers: [UnsBrokerConfigurationController],
  providers: [UnsBrokerConfigurationService, UnsBrokerConfigurationResolver],
  exports: [UnsBrokerConfigurationService],
})
export class UnsBrokerConfigurationModule {}
