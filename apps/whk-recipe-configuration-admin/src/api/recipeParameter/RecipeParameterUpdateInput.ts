import { RecipeParameterWhereUniqueInput } from "./RecipeParameterWhereUniqueInput";
import { RecipeParameterUpdateManyWithoutRecipeParametersInput } from "./RecipeParameterUpdateManyWithoutRecipeParametersInput";
import { InputJsonValue } from "../../types";

export type RecipeParameterUpdateInput = {
  active?: boolean;
  batch?: string | null;
  classId?: RecipeParameterWhereUniqueInput | null;
  className?: string;
  createdBy?: string;
  editedBy?: string | null;
  isClassDefinition?: boolean | null;
  itemId?: string;
  recipeParamDescription?: string | null;
  recipeParameters?: RecipeParameterUpdateManyWithoutRecipeParametersInput;
  recipeParamName?: string;
  recipeParamUnits?:
    | "Lbs"
    | "Gal"
    | "Percentage"
    | "PassFail"
    | "Seconds"
    | "Minutes"
    | "DateTime"
    | "Feet"
    | "Bushels"
    | null;
  recipeSetpointBooleanValue?: boolean | null;
  recipeSetpointLowerLimit?: number | null;
  recipeSetpointType?: "Boolean" | "Numeric";
  recipeSetpointUpperLimit?: number | null;
  revision?: number | null;
  schemaVersion?: string | null;
  sequencerParameters?: InputJsonValue;
};
