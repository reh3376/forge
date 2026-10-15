import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { RecipeParameterService } from "./recipeParameter.service";
import { RecipeParameterControllerBase } from "./base/recipeParameter.controller.base";
import { RecipeParameter } from "./base/RecipeParameter";

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

  @common.Post("actions/create-instance-from-class")
  @UseRoles({
    resource: "RecipeParameter",
    action: "create",
    possession: "any",
  })
  @swagger.ApiOperation({
    summary:
      "Create RecipeParameter instance from class definition and associate with recipe",
    description:
      "Creates a non-class instance of a RecipeParameter from a class definition and associates it with the specified recipe.",
  })
  @swagger.ApiQuery({
    name: "classDefId",
    type: "string",
    description: "ID of the class definition RecipeParameter",
    required: true,
  })
  @swagger.ApiQuery({
    name: "recipeId",
    type: "string",
    description: "ID of the Recipe to associate the new parameter with",
    required: true,
  })
  @swagger.ApiOkResponse({
    type: RecipeParameter,
    description: "The newly created RecipeParameter instance",
  })
  @swagger.ApiNotFoundResponse({
    description: "Class definition not found or recipe not found",
  })
  async createInstanceFromClassAndAssociateToRecipe(
    @common.Query("classDefId") classDefId: string,
    @common.Query("recipeId") recipeId: string,
    @common.Request() request: Express.Request
  ) {
    // Extract username as the creator ID
    const user = request.user as { username?: string };
    const userId = user?.username || "system";

    return this.service.createInstanceFromClassAndAssociateToRecipe(
      classDefId,
      recipeId,
      userId
    );
  }
}
