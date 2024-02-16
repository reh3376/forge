import { SortOrder } from "../../util/SortOrder";

export type EquipmentPhaseOrderByInput = {
  bomId?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  isClassDefinition?: SortOrder;
  name?: SortOrder;
  operationId?: SortOrder;
  operationSequenceIndex?: SortOrder;
  operationStepSequence?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  testParameterId?: SortOrder;
};
