import { RecipeParameterUpdateManyWithoutParameterTypesInput } from "./RecipeParameterUpdateManyWithoutParameterTypesInput";

export type ParameterTypeUpdateInput = {
  createdBy?: string;
  editedBy?: string | null;
  itemId?: string | null;
  recipeId?: string | null;
  recipeParameters?: RecipeParameterUpdateManyWithoutParameterTypesInput;
  schemaVersion?: string | null;
  setpointBooleanValue?: boolean | null;
  setpointLowerLimit?: number | null;
  setpointNumericalValue?: number | null;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit?: number | null;
  typeDescription?: string;
  typeName?: string;
  typeRevision?: number;
  typeUnits?: string;
};
