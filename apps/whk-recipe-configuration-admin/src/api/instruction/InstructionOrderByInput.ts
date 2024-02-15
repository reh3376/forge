import { SortOrder } from "../../util/SortOrder";

export type InstructionOrderByInput = {
  active?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedBy?: SortOrder;
  filePath?: SortOrder;
  id?: SortOrder;
  instructionRevision?: SortOrder;
  routes?: SortOrder;
  schemaVersion?: SortOrder;
  updatedAt?: SortOrder;
};
