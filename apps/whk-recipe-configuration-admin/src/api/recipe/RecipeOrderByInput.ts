import { SortOrder } from "../../util/SortOrder";
import { Recipe } from "./Recipe";

export type RecipeOrderByInput = {
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  customerId?: SortOrder;
  id?: SortOrder;
  itemDescription?: SortOrder;
  itemId?: SortOrder;
  Recipe?: SortOrder;
  recipeGroupId?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
