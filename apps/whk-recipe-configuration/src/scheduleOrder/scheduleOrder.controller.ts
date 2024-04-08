import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ScheduleOrderService } from "./scheduleOrder.service";
import { ScheduleOrderControllerBase } from "./base/scheduleOrder.controller.base";

@swagger.ApiTags("scheduleOrders")
@common.Controller("scheduleOrders")
export class ScheduleOrderController extends ScheduleOrderControllerBase {
  constructor(
    protected readonly service: ScheduleOrderService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
