import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { InventoryTransferResolverBase } from "./base/inventoryTransfer.resolver.base";
import { InventoryTransfer } from "./base/InventoryTransfer";
import { InventoryTransferService } from "./inventoryTransfer.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => InventoryTransfer)
export class InventoryTransferResolver extends InventoryTransferResolverBase {
  constructor(
    protected readonly service: InventoryTransferService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
