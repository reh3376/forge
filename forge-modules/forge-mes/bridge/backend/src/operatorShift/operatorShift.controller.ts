import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { OperatorShiftService } from "./operatorShift.service";
import { OperatorShiftControllerBase } from "./base/operatorShift.controller.base";

@swagger.ApiTags("operatorShifts")
@common.Controller("operatorShifts")
export class OperatorShiftController extends OperatorShiftControllerBase {
  constructor(
    protected readonly service: OperatorShiftService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
