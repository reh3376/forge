import { SortOrder } from "../../util/SortOrder";

export type RecipeOrderByInput = {
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  customer?: SortOrder;
  id?: SortOrder;
  item?: SortOrder;
  itemDescription?: SortOrder;
  mashBill?: SortOrder;
  operationId?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
