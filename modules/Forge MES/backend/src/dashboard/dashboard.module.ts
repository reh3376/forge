import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModuleBase } from "./base/dashboard.module.base";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardResolver } from "./dashboard.resolver";

@Module({
  imports: [DashboardModuleBase, forwardRef(() => AuthModule)],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardResolver],
  exports: [DashboardService],
})
export class DashboardModule {}
