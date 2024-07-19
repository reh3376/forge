import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { RecipeBomItemResolverBase } from "./base/recipeBomItem.resolver.base";
import { RecipeBomItem } from "./base/RecipeBomItem";
import { RecipeBomItemService } from "./recipeBomItem.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => RecipeBomItem)
export class RecipeBomItemResolver extends RecipeBomItemResolverBase {
  constructor(
    protected readonly service: RecipeBomItemService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
