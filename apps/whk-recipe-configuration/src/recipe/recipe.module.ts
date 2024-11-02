import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeModuleBase } from "./base/recipe.module.base";
import { RecipeService } from "./recipe.service";
import { RecipeController } from "./recipe.controller";
import { RecipeResolver } from "./recipe.resolver";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";
import { RecipeCreationService } from "./recipe.creation.service";
import { RabbitMQModule } from "../rabbitmq/rabbitmq.module";

@Module({
  imports: [RecipeModuleBase, forwardRef(() => AuthModule), RabbitMQModule],
  controllers: [RecipeController],
  providers: [RecipeService, RecipeResolver, RecipeCreationService, RecipeCookCreationService],
  exports: [RecipeService],
})
export class RecipeModule {}
