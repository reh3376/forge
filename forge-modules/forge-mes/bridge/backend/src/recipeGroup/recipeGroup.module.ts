import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeGroupModuleBase } from "./base/recipeGroup.module.base";
import { RecipeGroupService } from "./recipeGroup.service";
import { RecipeGroupController } from "./recipeGroup.controller";
import { RecipeGroupResolver } from "./recipeGroup.resolver";

@Module({
  imports: [RecipeGroupModuleBase, forwardRef(() => AuthModule)],
  controllers: [RecipeGroupController],
  providers: [RecipeGroupService, RecipeGroupResolver],
  exports: [RecipeGroupService],
})
export class RecipeGroupModule {}
