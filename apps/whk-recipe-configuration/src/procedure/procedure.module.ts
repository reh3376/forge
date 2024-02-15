import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProcedureModuleBase } from "./base/procedure.module.base";
import { ProcedureService } from "./procedure.service";
import { ProcedureController } from "./procedure.controller";
import { ProcedureResolver } from "./procedure.resolver";

@Module({
  imports: [ProcedureModuleBase, forwardRef(() => AuthModule)],
  controllers: [ProcedureController],
  providers: [ProcedureService, ProcedureResolver],
  exports: [ProcedureService],
})
export class ProcedureModule {}
