import { SortOrder } from "../../util/SortOrder";

export type PhaseParameterOrderByInput = {
  active?: SortOrder;
  classIdId?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  editedBy?: SortOrder;
  equipmentPhaseId?: SortOrder;
  id?: SortOrder;
  isClassDef?: SortOrder;
  itemId?: SortOrder;
  name?: SortOrder;
  recipeId?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  setpointBooleanValue?: SortOrder;
  setpointLowerLimit?: SortOrder;
  setpointNumericalValue?: SortOrder;
  setpointType?: SortOrder;
  setpointUpperLimit?: SortOrder;
  units?: SortOrder;
  updatedAt?: SortOrder;
};
