import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UnitsService } from "./units.service";
import { UnitsControllerBase } from "./base/units.controller.base";
import { InjectRolesBuilder } from "nest-access-control";

@swagger.ApiTags("units")
@common.Controller("units")
export class UnitsController extends UnitsControllerBase {
  constructor(
    protected readonly service: UnitsService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
