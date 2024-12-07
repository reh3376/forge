import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeModuleBase } from "./base/recipe.module.base";
import { RecipeService } from "./recipe.service";
import { RecipeController } from "./recipe.controller";
import { RecipeResolver } from "./recipe.resolver";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";
import { RabbitMQModule } from "../rabbitmq/rabbitmq.module";
import { RecipeGenerator } from "./recipe.generation";
import { EnzymeDosingService } from "./enzyme.dosing";

@Module({
  imports: [RecipeModuleBase, forwardRef(() => AuthModule), RabbitMQModule],
  controllers: [RecipeController],
  providers: [RecipeService, RecipeResolver, RecipeCookCreationService, RecipeGenerator, EnzymeDosingService],
  exports: [RecipeService],
})
export class RecipeModule {}
