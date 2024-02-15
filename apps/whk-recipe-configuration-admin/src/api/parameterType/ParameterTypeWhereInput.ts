import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { RecipeParameterListRelationFilter } from "../recipeParameter/RecipeParameterListRelationFilter";
import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { FloatNullableFilter } from "../../util/FloatNullableFilter";
import { IntFilter } from "../../util/IntFilter";

export type ParameterTypeWhereInput = {
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  id?: StringFilter;
  itemId?: StringNullableFilter;
  recipeId?: StringNullableFilter;
  recipeParameters?: RecipeParameterListRelationFilter;
  schemaVersion?: StringNullableFilter;
  setpointBooleanValue?: BooleanNullableFilter;
  setpointLowerLimit?: FloatNullableFilter;
  setpointNumericalValue?: FloatNullableFilter;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit?: FloatNullableFilter;
  typeDescription?: StringFilter;
  typeName?: StringFilter;
  typeRevision?: IntFilter;
  typeUnits?: StringFilter;
};
