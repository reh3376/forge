import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BatchParameterConfigurationModuleBase } from "./base/batchParameterConfiguration.module.base";
import { BatchParameterConfigurationService } from "./batchParameterConfiguration.service";
import { BatchParameterConfigurationController } from "./batchParameterConfiguration.controller";
import { BatchParameterConfigurationResolver } from "./batchParameterConfiguration.resolver";

@Module({
  imports: [
    BatchParameterConfigurationModuleBase,
    forwardRef(() => AuthModule),
  ],
  controllers: [BatchParameterConfigurationController],
  providers: [
    BatchParameterConfigurationService,
    BatchParameterConfigurationResolver,
  ],
  exports: [BatchParameterConfigurationService],
})
export class BatchParameterConfigurationModule {}
