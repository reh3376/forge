import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ProductionOrderQueueResolverBase } from "./base/productionOrderQueue.resolver.base";
import { ProductionOrderQueue } from "./base/ProductionOrderQueue";
import { ProductionOrderQueueService } from "./productionOrderQueue.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ProductionOrderQueue)
export class ProductionOrderQueueResolver extends ProductionOrderQueueResolverBase {
  constructor(
    protected readonly service: ProductionOrderQueueService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
