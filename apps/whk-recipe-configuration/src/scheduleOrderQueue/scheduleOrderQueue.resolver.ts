import * as graphql from "@nestjs/graphql";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ScheduleOrderQueueResolverBase } from "./base/scheduleOrderQueue.resolver.base";
import { ScheduleOrderQueue } from "./base/ScheduleOrderQueue";
import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ScheduleOrderQueue)
export class ScheduleOrderQueueResolver extends ScheduleOrderQueueResolverBase {
  constructor(
    protected readonly service: ScheduleOrderQueueService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
