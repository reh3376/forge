import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryLogModuleBase } from "./base/inventoryLog.module.base";
import { InventoryLogService } from "./inventoryLog.service";
import { InventoryLogController } from "./inventoryLog.controller";
import { InventoryLogResolver } from "./inventoryLog.resolver";

@Module({
  imports: [InventoryLogModuleBase, forwardRef(() => AuthModule)],
  controllers: [InventoryLogController],
  providers: [InventoryLogService, InventoryLogResolver],
  exports: [InventoryLogService],
})
export class InventoryLogModule {}
