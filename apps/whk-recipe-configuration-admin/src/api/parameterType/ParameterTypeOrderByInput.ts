import { SortOrder } from "../../util/SortOrder";

export type ParameterTypeOrderByInput = {
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  itemId?: SortOrder;
  recipeId?: SortOrder;
  schemaVersion?: SortOrder;
  setpointBooleanValue?: SortOrder;
  setpointLowerLimit?: SortOrder;
  setpointNumericalValue?: SortOrder;
  setpointType?: SortOrder;
  setpointUpperLimit?: SortOrder;
  typeDescription?: SortOrder;
  typeName?: SortOrder;
  typeRevision?: SortOrder;
  typeUnits?: SortOrder;
  updatedAt?: SortOrder;
};
