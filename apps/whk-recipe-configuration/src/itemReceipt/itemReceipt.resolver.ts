import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ItemReceiptResolverBase } from "./base/itemReceipt.resolver.base";
import { ItemReceipt } from "./base/ItemReceipt";
import { ItemReceiptService } from "./itemReceipt.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ItemReceipt)
export class ItemReceiptResolver extends ItemReceiptResolverBase {
  constructor(
    protected readonly service: ItemReceiptService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
