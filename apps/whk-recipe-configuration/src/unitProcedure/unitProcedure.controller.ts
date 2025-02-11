import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { UnitProcedureService } from "./unitProcedure.service";
import { UnitProcedureControllerBase } from "./base/unitProcedure.controller.base";

@swagger.ApiTags("unitProcedures")
@common.Controller("unitProcedures")
export class UnitProcedureController extends UnitProcedureControllerBase {
  constructor(
    protected readonly service: UnitProcedureService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
