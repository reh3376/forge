import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SalesOrderModuleBase } from "./base/salesOrder.module.base";
import { SalesOrderService } from "./salesOrder.service";
import { SalesOrderController } from "./salesOrder.controller";
import { SalesOrderResolver } from "./salesOrder.resolver";

@Module({
  imports: [SalesOrderModuleBase, forwardRef(() => AuthModule)],
  controllers: [SalesOrderController],
  providers: [SalesOrderService, SalesOrderResolver],
  exports: [SalesOrderService],
})
export class SalesOrderModule {}
