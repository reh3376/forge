import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { RecipeParameterService } from "./recipeParameter.service";
import { RecipeParameterControllerBase } from "./base/recipeParameter.controller.base";

@swagger.ApiTags("recipeParameters")
@common.Controller("recipeParameters")
export class RecipeParameterController extends RecipeParameterControllerBase {
  constructor(
    protected readonly service: RecipeParameterService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
