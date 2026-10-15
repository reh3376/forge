import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryTransferModuleBase } from "./base/inventoryTransfer.module.base";
import { InventoryTransferService } from "./inventoryTransfer.service";
import { InventoryTransferController } from "./inventoryTransfer.controller";
import { InventoryTransferResolver } from "./inventoryTransfer.resolver";

@Module({
  imports: [InventoryTransferModuleBase, forwardRef(() => AuthModule)],
  controllers: [InventoryTransferController],
  providers: [InventoryTransferService, InventoryTransferResolver],
  exports: [InventoryTransferService],
})
export class InventoryTransferModule {}
