import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeModuleBase } from "./base/recipe.module.base";
import { RecipeService } from "./recipe.service";
import { RecipeController } from "./recipe.controller";
import { RecipeResolver } from "./recipe.resolver";

@Module({
  imports: [RecipeModuleBase, forwardRef(() => AuthModule)],
  controllers: [RecipeController],
  providers: [RecipeService, RecipeResolver],
  exports: [RecipeService],
})
export class RecipeModule {}
