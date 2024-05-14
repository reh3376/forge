import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionOrderUnitProcedureModuleBase } from "./base/productionOrderUnitProcedure.module.base";
import { ProductionOrderUnitProcedureService } from "./productionOrderUnitProcedure.service";
import { ProductionOrderUnitProcedureController } from "./productionOrderUnitProcedure.controller";
import { ProductionOrderUnitProcedureResolver } from "./productionOrderUnitProcedure.resolver";

@Module({
  imports: [
    ProductionOrderUnitProcedureModuleBase,
    forwardRef(() => AuthModule),
  ],
  controllers: [ProductionOrderUnitProcedureController],
  providers: [
    ProductionOrderUnitProcedureService,
    ProductionOrderUnitProcedureResolver,
  ],
  exports: [ProductionOrderUnitProcedureService],
})
export class ProductionOrderUnitProcedureModule {}
