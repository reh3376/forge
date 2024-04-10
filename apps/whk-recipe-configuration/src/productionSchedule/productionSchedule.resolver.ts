import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ProductionScheduleResolverBase } from "./base/productionSchedule.resolver.base";
import { ProductionSchedule } from "./base/ProductionSchedule";
import { ProductionScheduleService } from "./productionSchedule.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ProductionSchedule)
export class ProductionScheduleResolver extends ProductionScheduleResolverBase {
  constructor(
    protected readonly service: ProductionScheduleService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
