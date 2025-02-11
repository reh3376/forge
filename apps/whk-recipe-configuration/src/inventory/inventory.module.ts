import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryModuleBase } from "./base/inventory.module.base";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { InventoryResolver } from "./inventory.resolver";
import { InventorySiloTrackingService } from "./inventory.silotracking.service"; // Add this import

@Module({
  imports: [InventoryModuleBase, forwardRef(() => AuthModule)],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryResolver,
    InventorySiloTrackingService,
  ], // Add SiloTrackingService here
  exports: [InventoryService, InventorySiloTrackingService], // Add SiloTrackingService to exports
})
export class InventoryModule {}
