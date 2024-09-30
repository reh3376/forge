import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdditiveActualModuleBase } from "./base/additiveActual.module.base";
import { AdditiveActualService } from "./additiveActual.service";
import { AdditiveActualController } from "./additiveActual.controller";
import { AdditiveActualResolver } from "./additiveActual.resolver";

@Module({
  imports: [AdditiveActualModuleBase, forwardRef(() => AuthModule)],
  controllers: [AdditiveActualController],
  providers: [AdditiveActualService, AdditiveActualResolver],
  exports: [AdditiveActualService],
})
export class AdditiveActualModule {}
