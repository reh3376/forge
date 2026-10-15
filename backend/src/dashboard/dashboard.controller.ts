import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { DashboardService } from "./dashboard.service";
import { DashboardControllerBase } from "./base/dashboard.controller.base";

@swagger.ApiTags("dashboards")
@common.Controller("dashboards")
export class DashboardController extends DashboardControllerBase {
  constructor(
    protected readonly service: DashboardService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
