import { InputJsonValue } from "../../types";

export type RecipeParameterUpdateInput = {
  active?: boolean;
  batch?: string | null;
  className?: string;
  createdBy?: string;
  editedBy?: string | null;
  itemId?: string;
  recipeParamDescription?: string | null;
  recipeParamName?: string;
  recipeParamRevision?: string | null;
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
  schemaVersion?: string | null;
  sequencerParameters?: InputJsonValue;
};
