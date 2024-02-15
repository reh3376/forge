import { JsonValue } from "type-fest";

export type RecipeParameter = {
  active: boolean;
  batch: string | null;
  className: string;
  createdAt: Date;
  createdBy: string;
  editedAt: Date | null;
  editedBy: string | null;
  id: string;
  itemId: string;
  recipeParamDescription: string | null;
  recipeParamName: string;
  recipeParamRevision: string | null;
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
  recipeSetpointBooleanValue: boolean | null;
  recipeSetpointLowerLimit: number | null;
  recipeSetpointType?: "Boolean" | "Numeric";
  recipeSetpointUpperLimit: number | null;
  schemaVersion: string | null;
  sequencerParameters: JsonValue;
};
