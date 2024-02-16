import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { PhaseParameterService } from "./phaseParameter.service";
import { PhaseParameterControllerBase } from "./base/phaseParameter.controller.base";

@swagger.ApiTags("phaseParameters")
@common.Controller("phaseParameters")
export class PhaseParameterController extends PhaseParameterControllerBase {
  constructor(
    protected readonly service: PhaseParameterService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
