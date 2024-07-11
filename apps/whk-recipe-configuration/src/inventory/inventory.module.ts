import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryModuleBase } from "./base/inventory.module.base";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { InventoryResolver } from "./inventory.resolver";

@Module({
  imports: [InventoryModuleBase, forwardRef(() => AuthModule)],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryResolver],
  exports: [InventoryService],
})
export class InventoryModule {}
