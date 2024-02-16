import { BooleanFilter } from "../../util/BooleanFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { RecipeParameterWhereUniqueInput } from "./RecipeParameterWhereUniqueInput";
import { StringFilter } from "../../util/StringFilter";
import { DateTimeFilter } from "../../util/DateTimeFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { RecipeParameterListRelationFilter } from "./RecipeParameterListRelationFilter";
import { FloatNullableFilter } from "../../util/FloatNullableFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { JsonFilter } from "../../util/JsonFilter";

export type RecipeParameterWhereInput = {
  active?: BooleanFilter;
  batch?: StringNullableFilter;
  classId?: RecipeParameterWhereUniqueInput;
  className?: StringFilter;
  createdAt?: DateTimeFilter;
  createdBy?: StringFilter;
  editedAt?: DateTimeNullableFilter;
  editedBy?: StringNullableFilter;
  id?: StringFilter;
  isClassDefinition?: BooleanNullableFilter;
  itemId?: StringFilter;
  recipeParamDescription?: StringNullableFilter;
  recipeParameters?: RecipeParameterListRelationFilter;
  recipeParamName?: StringFilter;
  recipeParamUnits?:
    | "Lbs"
    | "Gal"
    | "Percentage"
    | "PassFail"
    | "Seconds"
    | "Minutes"
    | "DateTime"
    | "Feet"
    | "Bushels";
  recipeSetpointBooleanValue?: BooleanNullableFilter;
  recipeSetpointLowerLimit?: FloatNullableFilter;
  recipeSetpointType?: "Boolean" | "Numeric";
  recipeSetpointUpperLimit?: FloatNullableFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  sequencerParameters?: JsonFilter;
};
