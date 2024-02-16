import { SortOrder } from "../../util/SortOrder";

export type BomOrderByInput = {
  batches?: SortOrder;
  bomItems?: SortOrder;
  bomName?: SortOrder;
  bomRevision?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  operationSteps?: SortOrder;
  schemaVersion?: SortOrder;
  wipItemId?: SortOrder;
};
