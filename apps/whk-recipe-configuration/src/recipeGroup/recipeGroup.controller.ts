import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { RecipeGroupService } from "./recipeGroup.service";
import { RecipeGroupControllerBase } from "./base/recipeGroup.controller.base";

@swagger.ApiTags("recipeGroups")
@common.Controller("recipeGroups")
export class RecipeGroupController extends RecipeGroupControllerBase {
  constructor(
    protected readonly service: RecipeGroupService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
