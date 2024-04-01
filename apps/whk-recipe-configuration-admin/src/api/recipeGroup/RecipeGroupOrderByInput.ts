import { SortOrder } from "../../util/SortOrder";

export type RecipeGroupOrderByInput = {
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  id?: SortOrder;
  recipe?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
