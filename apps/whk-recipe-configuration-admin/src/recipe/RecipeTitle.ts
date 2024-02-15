import { Recipe as TRecipe } from "../api/recipe/Recipe";

export const RECIPE_TITLE_FIELD = "createdBy";

export const RecipeTitle = (record: TRecipe): string => {
  return record.createdBy?.toString() || String(record.id);
};
