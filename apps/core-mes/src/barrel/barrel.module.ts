import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BarrelModuleBase } from "./base/barrel.module.base";
import { BarrelService } from "./barrel.service";
import { BarrelController } from "./barrel.controller";
import { BarrelResolver } from "./barrel.resolver";

@Module({
  imports: [BarrelModuleBase, forwardRef(() => AuthModule)],
  controllers: [BarrelController],
  providers: [BarrelService, BarrelResolver],
  exports: [BarrelService],
})
export class BarrelModule {}
