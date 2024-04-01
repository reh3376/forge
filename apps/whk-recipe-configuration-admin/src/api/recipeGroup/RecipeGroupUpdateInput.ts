import { RecipeUpdateManyWithoutRecipeGroupsInput } from "./RecipeUpdateManyWithoutRecipeGroupsInput";

export type RecipeGroupUpdateInput = {
  createdBy?: string;
  recipe?: string;
  recipes?: RecipeUpdateManyWithoutRecipeGroupsInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
