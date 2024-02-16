import { SortOrder } from "../../util/SortOrder";

export type OperationOrderByInput = {
  abbreviation?: SortOrder;
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
  procedureSequenceIndex?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  unitProcedureId?: SortOrder;
  updatedAt?: SortOrder;
};
