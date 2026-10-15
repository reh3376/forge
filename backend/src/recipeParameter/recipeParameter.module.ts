import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeParameterModuleBase } from "./base/recipeParameter.module.base";
import { RecipeParameterService } from "./recipeParameter.service";
import { RecipeParameterController } from "./recipeParameter.controller";
import { RecipeParameterResolver } from "./recipeParameter.resolver";

@Module({
  imports: [RecipeParameterModuleBase, forwardRef(() => AuthModule)],
  controllers: [RecipeParameterController],
  providers: [RecipeParameterService, RecipeParameterResolver],
  exports: [RecipeParameterService],
})
export class RecipeParameterModule {}
