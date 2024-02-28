import { SortOrder } from "../../util/SortOrder";

export type ProductionOrderQueueOrderByInput = {
  accountId?: SortOrder;
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  id?: SortOrder;
  procedureId?: SortOrder;
  queueIndex?: SortOrder;
  revision?: SortOrder;
  salesOrderId?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
