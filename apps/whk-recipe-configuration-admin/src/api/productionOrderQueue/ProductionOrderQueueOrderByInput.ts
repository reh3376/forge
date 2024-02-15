import { SortOrder } from "../../util/SortOrder";

export type ProductionOrderQueueOrderByInput = {
  accountId?: SortOrder;
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  id?: SortOrder;
  queueIndex?: SortOrder;
  recipeId?: SortOrder;
  revision?: SortOrder;
  salesOrderId?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
