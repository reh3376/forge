import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BarrelService } from "./barrel.service";
import { BarrelControllerBase } from "./base/barrel.controller.base";

@swagger.ApiTags("barrels")
@common.Controller("barrels")
export class BarrelController extends BarrelControllerBase {
  constructor(
    protected readonly service: BarrelService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
