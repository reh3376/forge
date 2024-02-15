import { RecipeParameter } from "../recipeParameter/RecipeParameter";

export type ParameterType = {
  createdAt: Date;
  createdBy: string;
  editedBy: string | null;
  id: string;
  itemId: string | null;
  recipeId: string | null;
  recipeParameters?: Array<RecipeParameter>;
  schemaVersion: string | null;
  setpointBooleanValue: boolean | null;
  setpointLowerLimit: number | null;
  setpointNumericalValue: number | null;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit: number | null;
  typeDescription: string;
  typeName: string;
  typeRevision: number;
  typeUnits: string;
  updatedAt: Date;
};
