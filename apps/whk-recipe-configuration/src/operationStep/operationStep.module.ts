import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationStepModuleBase } from "./base/operationStep.module.base";
import { OperationStepService } from "./operationStep.service";
import { OperationStepController } from "./operationStep.controller";
import { OperationStepResolver } from "./operationStep.resolver";

@Module({
  imports: [OperationStepModuleBase, forwardRef(() => AuthModule)],
  controllers: [OperationStepController],
  providers: [OperationStepService, OperationStepResolver],
  exports: [OperationStepService],
})
export class OperationStepModule {}
