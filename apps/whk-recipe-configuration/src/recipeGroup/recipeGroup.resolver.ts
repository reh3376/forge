import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { RecipeGroupResolverBase } from "./base/recipeGroup.resolver.base";
import { RecipeGroup } from "./base/RecipeGroup";
import { RecipeGroupService } from "./recipeGroup.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => RecipeGroup)
export class RecipeGroupResolver extends RecipeGroupResolverBase {
  constructor(
    protected readonly service: RecipeGroupService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
