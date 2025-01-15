import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeParameterService } from "./recipeParameter.service";
import { RecipeParameterControllerBase } from "./base/recipeParameter.controller.base";

@swagger.ApiTags("recipeParameters")
@common.Controller("recipeParameters")
export class RecipeParameterController extends RecipeParameterControllerBase {
  constructor(
    protected readonly service: RecipeParameterService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
