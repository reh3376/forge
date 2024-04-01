import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { Recipe } from "./Recipe";
import { RecipeGroupWhereUniqueInput } from "../recipeGroup/RecipeGroupWhereUniqueInput";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { UnitProcedureListRelationFilter } from "../unitProcedure/UnitProcedureListRelationFilter";

export type RecipeWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  customerId?: StringFilter;
  id?: StringFilter;
  itemDescription?: StringNullableFilter;
  itemId?: StringFilter;
  Recipe?: StringFilter;
  recipeGroup?: RecipeGroupWhereUniqueInput;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  unitProcedures?: UnitProcedureListRelationFilter;
  updatedBy?: StringNullableFilter;
};
