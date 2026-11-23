import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperatorShiftModuleBase } from "./base/operatorShift.module.base";
import { OperatorShiftService } from "./operatorShift.service";
import { OperatorShiftController } from "./operatorShift.controller";
import { OperatorShiftResolver } from "./operatorShift.resolver";

@Module({
  imports: [OperatorShiftModuleBase, forwardRef(() => AuthModule)],
  controllers: [OperatorShiftController],
  providers: [OperatorShiftService, OperatorShiftResolver],
  exports: [OperatorShiftService],
})
export class OperatorShiftModule {}
