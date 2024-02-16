import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeService } from "./recipe.service";
import { RecipeControllerBase } from "./base/recipe.controller.base";

@swagger.ApiTags("recipes")
@common.Controller("recipes")
export class RecipeController extends RecipeControllerBase {
  constructor(
    protected readonly service: RecipeService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
