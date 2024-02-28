import { SortOrder } from "../../util/SortOrder";

export type BomOrderByInput = {
  bomName?: SortOrder;
  bomRevision?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  schemaVersion?: SortOrder;
  wipItemId?: SortOrder;
};
