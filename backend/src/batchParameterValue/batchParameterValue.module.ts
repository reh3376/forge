import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BatchParameterValueModuleBase } from "./base/batchParameterValue.module.base";
import { BatchParameterValueService } from "./batchParameterValue.service";
import { BatchParameterValueController } from "./batchParameterValue.controller";
import { BatchParameterValueResolver } from "./batchParameterValue.resolver";

@Module({
  imports: [BatchParameterValueModuleBase, forwardRef(() => AuthModule)],
  controllers: [BatchParameterValueController],
  providers: [BatchParameterValueService, BatchParameterValueResolver],
  exports: [BatchParameterValueService],
})
export class BatchParameterValueModule {}
