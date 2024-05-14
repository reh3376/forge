import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UnitProcedureModuleBase } from "./base/unitProcedure.module.base";
import { UnitProcedureService } from "./unitProcedure.service";
import { UnitProcedureController } from "./unitProcedure.controller";
import { UnitProcedureResolver } from "./unitProcedure.resolver";
import {LoggerModule} from "../logger/logger.module";

@Module({
  imports: [UnitProcedureModuleBase, forwardRef(() => AuthModule), LoggerModule],
  controllers: [UnitProcedureController],
  providers: [UnitProcedureService, UnitProcedureResolver],
  exports: [UnitProcedureService],
})
export class UnitProcedureModule {}
