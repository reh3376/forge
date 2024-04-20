import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { SalesOrderResolverBase } from "./base/salesOrder.resolver.base";
import { SalesOrder } from "./base/SalesOrder";
import { SalesOrderService } from "./salesOrder.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => SalesOrder)
export class SalesOrderResolver extends SalesOrderResolverBase {
  constructor(
    protected readonly service: SalesOrderService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
