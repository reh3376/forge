import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PurchaseOrderModuleBase } from "./base/purchaseOrder.module.base";
import { PurchaseOrderService } from "./purchaseOrder.service";
import { PurchaseOrderController } from "./purchaseOrder.controller";
import { PurchaseOrderResolver } from "./purchaseOrder.resolver";

@Module({
  imports: [PurchaseOrderModuleBase, forwardRef(() => AuthModule)],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService, PurchaseOrderResolver],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
