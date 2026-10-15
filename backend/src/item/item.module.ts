import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ItemModuleBase } from "./base/item.module.base";
import { ItemService } from "./item.service";
import { ItemController } from "./item.controller";
import { ItemResolver } from "./item.resolver";
import { ContainerItemService } from "../productionOrder/container-item.service";

@Module({
  imports: [ItemModuleBase, forwardRef(() => AuthModule)],
  controllers: [ItemController],
  providers: [ItemService, ItemResolver, ContainerItemService],
  exports: [ItemService, ContainerItemService],
})
export class ItemModule {}
