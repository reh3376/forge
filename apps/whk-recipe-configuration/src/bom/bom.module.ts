import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BomModuleBase } from "./base/bom.module.base";
import { BomService } from "./bom.service";
import { BomController } from "./bom.controller";
import { BomResolver } from "./bom.resolver";

@Module({
  imports: [BomModuleBase, forwardRef(() => AuthModule)],
  controllers: [BomController],
  providers: [BomService, BomResolver],
  exports: [BomService],
})
export class BomModule {}
