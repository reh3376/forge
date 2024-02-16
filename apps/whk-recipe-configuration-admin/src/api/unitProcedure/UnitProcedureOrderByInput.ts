import { SortOrder } from "../../util/SortOrder";

export type UnitProcedureOrderByInput = {
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  id?: SortOrder;
  name?: SortOrder;
  procedureId?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
  updatedBy?: SortOrder;
};
