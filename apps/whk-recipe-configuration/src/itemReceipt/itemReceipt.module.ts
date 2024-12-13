import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ItemReceiptModuleBase } from "./base/itemReceipt.module.base";
import { ItemReceiptService } from "./itemReceipt.service";
import { ItemReceiptController } from "./itemReceipt.controller";
import { ItemReceiptResolver } from "./itemReceipt.resolver";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [ItemReceiptModuleBase, forwardRef(() => AuthModule), InventoryModule],
  controllers: [ItemReceiptController],
  providers: [ItemReceiptService, ItemReceiptResolver],
  exports: [ItemReceiptService],
})
export class ItemReceiptModule {}
