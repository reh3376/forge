import { SortOrder } from "../../util/SortOrder";

export type LotOrderByInput = {
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  id?: SortOrder;
  item?: SortOrder;
  purchaseOrderLoadedIn?: SortOrder;
  purchaseOrderRejectedLot?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
