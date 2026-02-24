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
import { RecipeParameterResolverBase } from "./base/recipeParameter.resolver.base";
import { RecipeParameter } from "./base/RecipeParameter";
import { RecipeParameterService } from "./recipeParameter.service";

/**
 * RecipeParameter resolver with GraphQL endpoints.
 *
 * The base resolver has been extended with additional mutations for managing Recipe relationships:
 * - connectRecipeParameterRecipe: Connect Recipe entities to a RecipeParameter (matches POST /:id/recipe endpoint)
 * - updateRecipeParameterRecipe: Set Recipe entities for a RecipeParameter (matches PATCH /:id/recipe endpoint)
 * - disconnectRecipeParameterRecipe: Disconnect Recipe entities from a RecipeParameter (matches DELETE /:id/recipe endpoint)
 */
@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => RecipeParameter)
export class RecipeParameterResolver extends RecipeParameterResolverBase {
  constructor(
    protected readonly service: RecipeParameterService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
