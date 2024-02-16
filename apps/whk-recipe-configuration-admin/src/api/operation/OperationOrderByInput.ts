import { SortOrder } from "../../util/SortOrder";

export type OperationOrderByInput = {
  active?: SortOrder;
  classIdId?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  isClassDefinition?: SortOrder;
  name?: SortOrder;
  path?: SortOrder;
  procedureId?: SortOrder;
  procedureSequenceIndex?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
};
