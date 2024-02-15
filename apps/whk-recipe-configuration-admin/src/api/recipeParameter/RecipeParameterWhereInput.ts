import { BooleanFilter } from "../../util/BooleanFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { DateTimeFilter } from "../../util/DateTimeFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { ParameterTypeWhereUniqueInput } from "../parameterType/ParameterTypeWhereUniqueInput";
import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { FloatNullableFilter } from "../../util/FloatNullableFilter";
import { JsonFilter } from "../../util/JsonFilter";

export type RecipeParameterWhereInput = {
  active?: BooleanFilter;
  batch?: StringNullableFilter;
  className?: StringFilter;
  createdAt?: DateTimeFilter;
  createdBy?: StringFilter;
  editedAt?: DateTimeNullableFilter;
  editedBy?: StringNullableFilter;
  id?: StringFilter;
  itemId?: StringFilter;
  parameterType?: ParameterTypeWhereUniqueInput;
  recipeParamDescription?: StringNullableFilter;
  recipeParamName?: StringFilter;
  recipeParamRevision?: StringNullableFilter;
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
  schemaVersion?: StringNullableFilter;
  sequencerParameters?: JsonFilter;
};
