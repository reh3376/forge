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
import { ProductionOrderBomItemResolverBase } from "./base/productionOrderBomItem.resolver.base";
import { ProductionOrderBomItem } from "./base/ProductionOrderBomItem";
import { ProductionOrderBomItemService } from "./productionOrderBomItem.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ProductionOrderBomItem)
export class ProductionOrderBomItemResolver extends ProductionOrderBomItemResolverBase {
  constructor(
    protected readonly service: ProductionOrderBomItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
