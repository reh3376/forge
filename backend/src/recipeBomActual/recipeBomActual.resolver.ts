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

  /**
   * Validate a scanned code (UUID or lot number) against a specific item.
   * Returns inventory details and whether this is the FIFO-recommended lot.
   * Called on every lot number change in the consumption sheet UI.
   */
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

  /**
   * Record a BOM consumption entry.
   * Validates the BOM item and recipe instance exist, checks available inventory
   * when an inventoryId is provided, creates the RecipeBomActual record via
   * ScheduleOrderRecipeInstanceService, then decrements Inventory.currentQuantity.
   */
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

  /**
   * Correct an existing BOM consumption record.
   * Partial update — only provided fields are changed. When quantityActual changes,
   * inventory is adjusted by the delta. All changes are written to the audit log.
   * Requires Production Manager role or higher.
   */
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
