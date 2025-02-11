import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ProductionOrderResolverBase } from "./base/productionOrder.resolver.base";
import { ProductionOrder } from "./base/ProductionOrder";
import { ProductionOrderService } from "./productionOrder.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ProductionOrder)
export class ProductionOrderResolver extends ProductionOrderResolverBase {
  constructor(
    protected readonly service: ProductionOrderService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @graphql.Query(() => [ProductionOrder])
  async getUnlinkedPendingProductionOrders() {
    return this.service.productionOrders({
      where: {
        AND: [
          {
            scheduleOrder: {
              scheduleOrderQueues: null,
              status: {
                equals: "Scheduled"
              }
            }
          },
          {
            status: { equals: "Initiated" }
          }
        ]
      },
      include: {
        scheduleOrder: true
      }
    });
  }
}
