import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { RecipeBomActualResolverBase } from "./base/recipeBomActual.resolver.base";
import { RecipeBomActual } from "./base/RecipeBomActual";
import { RecipeBomActualService } from "./recipeBomActual.service";
import { InjectRolesBuilder, UseRoles } from "nest-access-control";
import {
  LotLookupResult,
  RecordBomConsumptionInput,
  UpdateBomConsumptionInput,
} from "./dto/bom-consumption.dto";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => RecipeBomActual)
export class RecipeBomActualResolver extends RecipeBomActualResolverBase {
  constructor(
    protected readonly service: RecipeBomActualService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @graphql.Query(() => LotLookupResult)
  @UseRoles({
    resource: "RecipeBomActual",
    action: "read",
    possession: "any",
  })
  async lookupLotOrInventory(
    @graphql.Args("code", { type: () => String }) code: string,
    @graphql.Args("itemId", { type: () => String }) itemId: string
  ): Promise<LotLookupResult> {
    return this.service.lookupLotOrInventory(code, itemId);
  }

  @graphql.Mutation(() => RecipeBomActual)
  @UseRoles({
    resource: "RecipeBomActual",
    action: "create",
    possession: "any",
  })
  async recordBomConsumption(
    @graphql.Args("input") input: RecordBomConsumptionInput
  ): Promise<RecipeBomActual> {
    return this.service.recordBomConsumption(input);
  }

  @graphql.Mutation(() => RecipeBomActual)
  @UseRoles({
    resource: "RecipeBomActual",
    action: "update",
    possession: "any",
  })
  async updateBomConsumption(
    @graphql.Args("id", { type: () => String }) id: string,
    @graphql.Args("input") input: UpdateBomConsumptionInput
  ): Promise<RecipeBomActual> {
    return this.service.updateBomConsumption(id, input);
  }
}
