import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationModuleBase } from "./base/operation.module.base";
import { OperationService } from "./operation.service";
import { OperationController } from "./operation.controller";
import { OperationResolver } from "./operation.resolver";

@Module({
  imports: [OperationModuleBase, forwardRef(() => AuthModule)],
  controllers: [OperationController],
  providers: [OperationService, OperationResolver],
  exports: [OperationService],
})
export class OperationModule {}
