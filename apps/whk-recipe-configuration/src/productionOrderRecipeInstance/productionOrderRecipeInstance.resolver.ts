import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ProductionOrderRecipeInstanceResolverBase } from "./base/productionOrderRecipeInstance.resolver.base";
import { ProductionOrderRecipeInstance } from "./base/ProductionOrderRecipeInstance";
import { ProductionOrderRecipeInstanceService } from "./productionOrderRecipeInstance.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ProductionOrderRecipeInstance)
export class ProductionOrderRecipeInstanceResolver extends ProductionOrderRecipeInstanceResolverBase {
  constructor(
    protected readonly service: ProductionOrderRecipeInstanceService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
