import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BatchMaterialConsumptionModuleBase } from "./base/batchMaterialConsumption.module.base";
import { BatchMaterialConsumptionService } from "./batchMaterialConsumption.service";
import { BatchMaterialConsumptionController } from "./batchMaterialConsumption.controller";
import { BatchMaterialConsumptionResolver } from "./batchMaterialConsumption.resolver";

@Module({
  imports: [BatchMaterialConsumptionModuleBase, forwardRef(() => AuthModule)],
  controllers: [BatchMaterialConsumptionController],
  providers: [
    BatchMaterialConsumptionService,
    BatchMaterialConsumptionResolver,
  ],
  exports: [BatchMaterialConsumptionService],
})
export class BatchMaterialConsumptionModule {}
