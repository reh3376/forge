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
import { ItemResolverBase } from "./base/item.resolver.base";
import { Item } from "./base/Item";
import { ItemService } from "./item.service";
import { ContainerItemService } from "../productionOrder/container-item.service";
import { EnumProductionOrderContainerType } from "@prisma/client";
import { GraphQLJSONObject } from "graphql-type-json";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => Item)
export class ItemResolver extends ItemResolverBase {
  constructor(
    protected readonly service: ItemService,
    protected readonly containerItemService: ContainerItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @graphql.Query(() => [Item])
  @UseRoles({
    resource: "Item",
    action: "read",
    possession: "any",
  })
  async containerItemsByType(
    @graphql.Args("containerType")
    containerType: EnumProductionOrderContainerType
  ): Promise<Item[]> {
    return this.containerItemService.getContainerItemsByType(containerType);
  }

  @graphql.Query(() => GraphQLJSONObject)
  @UseRoles({
    resource: "Item",
    action: "read",
    possession: "any",
  })
  async validateContainerItemCompatibility(
    @graphql.Args("itemId") itemId: string,
    @graphql.Args("containerType")
    containerType: EnumProductionOrderContainerType
  ): Promise<{ isValid: boolean; message?: string }> {
    return this.containerItemService.validateContainerItemCompatibility(
      itemId,
      containerType
    );
  }

  @graphql.Query(() => GraphQLJSONObject)
  @UseRoles({
    resource: "Item",
    action: "read",
    possession: "any",
  })
  async containerItemUsageStats(
    @graphql.Args("itemId") itemId: string
  ): Promise<any> {
    return this.containerItemService.getContainerItemUsageStats(itemId);
  }
}
