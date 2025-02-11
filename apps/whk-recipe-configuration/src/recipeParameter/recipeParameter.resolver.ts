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
