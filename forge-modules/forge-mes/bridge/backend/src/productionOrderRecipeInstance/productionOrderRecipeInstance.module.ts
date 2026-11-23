import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionOrderRecipeInstanceModuleBase } from "./base/productionOrderRecipeInstance.module.base";
import { ProductionOrderRecipeInstanceService } from "./productionOrderRecipeInstance.service";
import { ProductionOrderRecipeInstanceController } from "./productionOrderRecipeInstance.controller";
import { ProductionOrderRecipeInstanceResolver } from "./productionOrderRecipeInstance.resolver";

@Module({
  imports: [
    ProductionOrderRecipeInstanceModuleBase,
    forwardRef(() => AuthModule),
  ],
  controllers: [ProductionOrderRecipeInstanceController],
  providers: [
    ProductionOrderRecipeInstanceService,
    ProductionOrderRecipeInstanceResolver,
  ],
  exports: [ProductionOrderRecipeInstanceService],
})
export class ProductionOrderRecipeInstanceModule {}
