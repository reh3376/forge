import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BomItemModuleBase } from "./base/bomItem.module.base";
import { BomItemService } from "./bomItem.service";
import { BomItemController } from "./bomItem.controller";
import { BomItemResolver } from "./bomItem.resolver";

@Module({
  imports: [BomItemModuleBase, forwardRef(() => AuthModule)],
  controllers: [BomItemController],
  providers: [BomItemService, BomItemResolver],
  exports: [BomItemService],
})
export class BomItemModule {}
