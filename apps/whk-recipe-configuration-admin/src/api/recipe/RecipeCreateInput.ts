import { Recipe } from "./Recipe";
import { RecipeGroupWhereUniqueInput } from "../recipeGroup/RecipeGroupWhereUniqueInput";
import { UnitProcedureCreateNestedManyWithoutRecipesInput } from "./UnitProcedureCreateNestedManyWithoutRecipesInput";

export type RecipeCreateInput = {
  active?: boolean | null;
  createdBy: string;
  customerId: string;
  itemDescription?: string | null;
  itemId: string;
  Recipe: string;
  recipeGroup?: RecipeGroupWhereUniqueInput | null;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureCreateNestedManyWithoutRecipesInput;
  updatedBy?: string | null;
};
