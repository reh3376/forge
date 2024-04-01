import { RecipeGroup } from "../recipeGroup/RecipeGroup";
import { UnitProcedure } from "../unitProcedure/UnitProcedure";

export type Recipe = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  customerId: string;
  id: string;
  itemDescription: string | null;
  itemId: string;
  Recipe: string;
  recipeGroup?: RecipeGroup | null;
  revision: number | null;
  schemaVersion: string | null;
  unitProcedures?: Array<UnitProcedure>;
  updatedAt: Date;
  updatedBy: string | null;
};
