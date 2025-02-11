import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { PhaseParameterService } from "./phaseParameter.service";
import { PhaseParameterControllerBase } from "./base/phaseParameter.controller.base";

@swagger.ApiTags("phaseParameters")
@common.Controller("phaseParameters")
export class PhaseParameterController extends PhaseParameterControllerBase {
  constructor(
    protected readonly service: PhaseParameterService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
