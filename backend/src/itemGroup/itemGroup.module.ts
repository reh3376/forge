import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ItemGroupModuleBase } from "./base/itemGroup.module.base";
import { ItemGroupService } from "./itemGroup.service";
import { ItemGroupController } from "./itemGroup.controller";
import { ItemGroupResolver } from "./itemGroup.resolver";

@Module({
  imports: [ItemGroupModuleBase, forwardRef(() => AuthModule)],
  controllers: [ItemGroupController],
  providers: [ItemGroupService, ItemGroupResolver],
  exports: [ItemGroupService],
})
export class ItemGroupModule {}
