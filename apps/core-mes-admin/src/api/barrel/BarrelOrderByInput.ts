import { SortOrder } from "../../util/SortOrder";

export type BarrelOrderByInput = {
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  filledAt?: SortOrder;
  filledBy?: SortOrder;
  id?: SortOrder;
  lotId?: SortOrder;
  serialNumber?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
