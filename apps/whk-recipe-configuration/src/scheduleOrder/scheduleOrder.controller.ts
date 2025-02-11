import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ScheduleOrderService } from "./scheduleOrder.service";
import { ScheduleOrderControllerBase } from "./base/scheduleOrder.controller.base";

@swagger.ApiTags("scheduleOrders")
@common.Controller("scheduleOrders")
export class ScheduleOrderController extends ScheduleOrderControllerBase {
  constructor(
    protected readonly service: ScheduleOrderService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
