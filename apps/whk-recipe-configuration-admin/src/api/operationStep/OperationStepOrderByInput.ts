import { SortOrder } from "../../util/SortOrder";

export type OperationStepOrderByInput = {
  bomId?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  operationId?: SortOrder;
  operationStepDescription?: SortOrder;
  operationStepName?: SortOrder;
  operationStepRevision?: SortOrder;
  operationStepSequence?: SortOrder;
  recipeId?: SortOrder;
  schemaVersion?: SortOrder;
  sequenceOperation?: SortOrder;
  tests?: SortOrder;
};
