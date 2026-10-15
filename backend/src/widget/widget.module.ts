import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WidgetModuleBase } from "./base/widget.module.base";
import { WidgetService } from "./widget.service";
import { WidgetController } from "./widget.controller";
import { WidgetResolver } from "./widget.resolver";

@Module({
  imports: [WidgetModuleBase, forwardRef(() => AuthModule)],
  controllers: [WidgetController],
  providers: [WidgetService, WidgetResolver],
  exports: [WidgetService],
})
export class WidgetModule {}
