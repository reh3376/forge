import { RecipeParameter as TRecipeParameter } from "../api/recipeParameter/RecipeParameter";

export const RECIPEPARAMETER_TITLE_FIELD = "className";

export const RecipeParameterTitle = (record: TRecipeParameter): string => {
  return record.className?.toString() || String(record.id);
};
