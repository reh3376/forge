import { SortOrder } from "../../util/SortOrder";

export type OperationOrderByInput = {
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedBy?: SortOrder;
  globalUuid?: SortOrder;
  id?: SortOrder;
  operationDescription?: SortOrder;
  operationName?: SortOrder;
  operationRevision?: SortOrder;
  operationSequenceNumber?: SortOrder;
  route?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
};
