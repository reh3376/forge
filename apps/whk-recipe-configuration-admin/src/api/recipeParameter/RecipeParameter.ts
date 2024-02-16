import { JsonValue } from "type-fest";

export type RecipeParameter = {
  active: boolean;
  batch: string | null;
  classId?: RecipeParameter | null;
  className: string;
  createdAt: Date;
  createdBy: string;
  editedAt: Date | null;
  editedBy: string | null;
  id: string;
  isClassDefinition: boolean | null;
  itemId: string;
  recipeParamDescription: string | null;
  recipeParameters?: Array<RecipeParameter>;
  recipeParamName: string;
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
  revision: number | null;
  schemaVersion: string | null;
  sequencerParameters: JsonValue;
};
