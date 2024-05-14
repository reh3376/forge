import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UnitModuleBase } from "./base/unit.module.base";
import { UnitService } from "./unit.service";
import { UnitController } from "./unit.controller";
import { UnitResolver } from "./unit.resolver";

@Module({
  imports: [UnitModuleBase, forwardRef(() => AuthModule)],
  controllers: [UnitController],
  providers: [UnitService, UnitResolver],
  exports: [UnitService],
})
export class UnitModule {}
