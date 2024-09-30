import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { AdditiveActualService } from "./additiveActual.service";
import { AdditiveActualControllerBase } from "./base/additiveActual.controller.base";

@swagger.ApiTags("additiveActuals")
@common.Controller("additiveActuals")
export class AdditiveActualController extends AdditiveActualControllerBase {
  constructor(
    protected readonly service: AdditiveActualService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
