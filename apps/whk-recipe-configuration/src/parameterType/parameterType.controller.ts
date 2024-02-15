import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ParameterTypeService } from "./parameterType.service";
import { ParameterTypeControllerBase } from "./base/parameterType.controller.base";

@swagger.ApiTags("parameterTypes")
@common.Controller("parameterTypes")
export class ParameterTypeController extends ParameterTypeControllerBase {
  constructor(
    protected readonly service: ParameterTypeService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
