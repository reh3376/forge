import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ScheduleOrderResolverBase } from "./base/scheduleOrder.resolver.base";
import { ScheduleOrder } from "./base/ScheduleOrder";
import { ScheduleOrderService } from "./scheduleOrder.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ScheduleOrder)
export class ScheduleOrderResolver extends ScheduleOrderResolverBase {
  constructor(
    protected readonly service: ScheduleOrderService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
