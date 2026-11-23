import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionOrderBomItemModuleBase } from "./base/productionOrderBomItem.module.base";
import { ProductionOrderBomItemService } from "./productionOrderBomItem.service";
import { ProductionOrderBomItemController } from "./productionOrderBomItem.controller";
import { ProductionOrderBomItemResolver } from "./productionOrderBomItem.resolver";

@Module({
  imports: [ProductionOrderBomItemModuleBase, forwardRef(() => AuthModule)],
  controllers: [ProductionOrderBomItemController],
  providers: [ProductionOrderBomItemService, ProductionOrderBomItemResolver],
  exports: [ProductionOrderBomItemService],
})
export class ProductionOrderBomItemModule {}
