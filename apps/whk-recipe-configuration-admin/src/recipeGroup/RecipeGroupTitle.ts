import { RecipeGroup as TRecipeGroup } from "../api/recipeGroup/RecipeGroup";

export const RECIPEGROUP_TITLE_FIELD = "createdBy";

export const RecipeGroupTitle = (record: TRecipeGroup): string => {
  return record.createdBy?.toString() || String(record.id);
};
