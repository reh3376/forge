import { SortOrder } from "../../util/SortOrder";

export type ProcedureOrderByInput = {
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  id?: SortOrder;
  name?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
