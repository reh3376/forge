import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ProductionOrderUnitProcedureResolverBase } from "./base/productionOrderUnitProcedure.resolver.base";
import { ProductionOrderUnitProcedure } from "./base/ProductionOrderUnitProcedure";
import { ProductionOrderUnitProcedureService } from "./productionOrderUnitProcedure.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ProductionOrderUnitProcedure)
export class ProductionOrderUnitProcedureResolver extends ProductionOrderUnitProcedureResolverBase {
  constructor(
    protected readonly service: ProductionOrderUnitProcedureService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
