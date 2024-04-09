import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";
import { ScheduleOrderQueueControllerBase } from "./base/scheduleOrderQueue.controller.base";

@swagger.ApiTags("scheduleOrderQueues")
@common.Controller("scheduleOrderQueues")
export class ScheduleOrderQueueController extends ScheduleOrderQueueControllerBase {
  constructor(
    protected readonly service: ScheduleOrderQueueService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
