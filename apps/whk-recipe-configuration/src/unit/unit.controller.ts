import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UnitService } from "./unit.service";
import { UnitControllerBase } from "./base/unit.controller.base";

@swagger.ApiTags("units")
@common.Controller("units")
export class UnitController extends UnitControllerBase {
  constructor(
    protected readonly service: UnitService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
