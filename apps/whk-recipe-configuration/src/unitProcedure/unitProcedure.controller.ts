import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UnitProcedureService } from "./unitProcedure.service";
import { UnitProcedureControllerBase } from "./base/unitProcedure.controller.base";

@swagger.ApiTags("unitProcedures")
@common.Controller("unitProcedures")
export class UnitProcedureController extends UnitProcedureControllerBase {
  constructor(
    protected readonly service: UnitProcedureService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
