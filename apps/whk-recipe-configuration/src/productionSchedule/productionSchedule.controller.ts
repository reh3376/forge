import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProductionScheduleService } from "./productionSchedule.service";
import { ProductionScheduleControllerBase } from "./base/productionSchedule.controller.base";

@swagger.ApiTags("productionSchedules")
@common.Controller("productionSchedules")
export class ProductionScheduleController extends ProductionScheduleControllerBase {
  constructor(
    protected readonly service: ProductionScheduleService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
