import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UnitsModuleBase } from "./base/units.module.base";
import { UnitsService } from "./units.service";
import { UnitsController } from "./units.controller";
import { UnitsResolver } from "./units.resolver";

@Module({
  imports: [UnitsModuleBase, forwardRef(() => AuthModule)],
  controllers: [UnitsController],
  providers: [UnitsService, UnitsResolver],
  exports: [UnitsService],
})
export class UnitsModule {}
