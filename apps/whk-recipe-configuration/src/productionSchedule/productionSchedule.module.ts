import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductionScheduleModuleBase } from "./base/productionSchedule.module.base";
import { ProductionScheduleService } from "./productionSchedule.service";
import { ProductionScheduleController } from "./productionSchedule.controller";
import { ProductionScheduleResolver } from "./productionSchedule.resolver";

@Module({
  imports: [ProductionScheduleModuleBase, forwardRef(() => AuthModule)],
  controllers: [ProductionScheduleController],
  providers: [ProductionScheduleService, ProductionScheduleResolver],
  exports: [ProductionScheduleService],
})
export class ProductionScheduleModule {}
