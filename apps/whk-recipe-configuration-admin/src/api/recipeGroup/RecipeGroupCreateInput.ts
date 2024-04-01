import { RecipeCreateNestedManyWithoutRecipeGroupsInput } from "./RecipeCreateNestedManyWithoutRecipeGroupsInput";

export type RecipeGroupCreateInput = {
  createdBy: string;
  recipe: string;
  recipes?: RecipeCreateNestedManyWithoutRecipeGroupsInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
