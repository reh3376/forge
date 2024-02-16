import { SortOrder } from "../../util/SortOrder";

export type OperationOrderByInput = {
  active?: SortOrder;
  classIdId?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  editedBy?: SortOrder;
  globalUuid?: SortOrder;
  id?: SortOrder;
  isClassDefinition?: SortOrder;
  name?: SortOrder;
  procedureId?: SortOrder;
  procedureSequenceIndex?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
};
