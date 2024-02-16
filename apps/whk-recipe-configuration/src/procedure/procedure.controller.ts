import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProcedureService } from "./procedure.service";
import { ProcedureControllerBase } from "./base/procedure.controller.base";

@swagger.ApiTags("procedures")
@common.Controller("procedures")
export class ProcedureController extends ProcedureControllerBase {
  constructor(
    protected readonly service: ProcedureService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
