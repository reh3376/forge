import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeGroupService } from "./recipeGroup.service";
import { RecipeGroupControllerBase } from "./base/recipeGroup.controller.base";

@swagger.ApiTags("recipeGroups")
@common.Controller("recipeGroups")
export class RecipeGroupController extends RecipeGroupControllerBase {
  constructor(
    protected readonly service: RecipeGroupService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
