import { RecipeWhereUniqueInput } from "./RecipeWhereUniqueInput";
import { RecipeUpdateInput } from "./RecipeUpdateInput";

export type UpdateRecipeArgs = {
  where: RecipeWhereUniqueInput;
  data: RecipeUpdateInput;
};
