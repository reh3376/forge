import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeBomItemModuleBase } from "./base/recipeBomItem.module.base";
import { RecipeBomItemService } from "./recipeBomItem.service";
import { RecipeBomItemController } from "./recipeBomItem.controller";
import { RecipeBomItemResolver } from "./recipeBomItem.resolver";

@Module({
  imports: [RecipeBomItemModuleBase, forwardRef(() => AuthModule)],
  controllers: [RecipeBomItemController],
  providers: [RecipeBomItemService, RecipeBomItemResolver],
  exports: [RecipeBomItemService],
})
export class RecipeBomItemModule {}
