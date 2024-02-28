import { SortOrder } from "../../util/SortOrder";

export type RecipeOrderByInput = {
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  customerId?: SortOrder;
  id?: SortOrder;
  itemDescription?: SortOrder;
  itemId?: SortOrder;
  mashBill?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
