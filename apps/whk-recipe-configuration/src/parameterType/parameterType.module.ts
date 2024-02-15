import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ParameterTypeModuleBase } from "./base/parameterType.module.base";
import { ParameterTypeService } from "./parameterType.service";
import { ParameterTypeController } from "./parameterType.controller";
import { ParameterTypeResolver } from "./parameterType.resolver";

@Module({
  imports: [ParameterTypeModuleBase, forwardRef(() => AuthModule)],
  controllers: [ParameterTypeController],
  providers: [ParameterTypeService, ParameterTypeResolver],
  exports: [ParameterTypeService],
})
export class ParameterTypeModule {}
