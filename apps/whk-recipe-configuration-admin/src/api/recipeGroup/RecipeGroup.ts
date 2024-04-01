import { Recipe } from "../recipe/Recipe";

export type RecipeGroup = {
  createdAt: Date;
  createdBy: string;
  id: string;
  recipe: string;
  recipes?: Array<Recipe>;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
