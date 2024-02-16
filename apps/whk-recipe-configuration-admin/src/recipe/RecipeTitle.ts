import { Recipe as TRecipe } from "../api/recipe/Recipe";

export const RECIPE_TITLE_FIELD = "customerId";

export const RecipeTitle = (record: TRecipe): string => {
  return record.customerId?.toString() || String(record.id);
};
