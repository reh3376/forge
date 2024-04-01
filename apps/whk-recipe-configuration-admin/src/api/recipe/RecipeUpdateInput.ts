import { Recipe } from "./Recipe";
import { RecipeGroupWhereUniqueInput } from "../recipeGroup/RecipeGroupWhereUniqueInput";
import { UnitProcedureUpdateManyWithoutRecipesInput } from "./UnitProcedureUpdateManyWithoutRecipesInput";

export type RecipeUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  customerId?: string;
  itemDescription?: string | null;
  itemId?: string;
  Recipe?: string;
  recipeGroup?: RecipeGroupWhereUniqueInput | null;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureUpdateManyWithoutRecipesInput;
  updatedBy?: string | null;
};
