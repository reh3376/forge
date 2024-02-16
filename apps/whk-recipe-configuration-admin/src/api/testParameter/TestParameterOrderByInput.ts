import { SortOrder } from "../../util/SortOrder";

export type TestParameterOrderByInput = {
  active?: SortOrder;
  classIdId?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  description?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  isClassDef?: SortOrder;
  name?: SortOrder;
  schemaVersion?: SortOrder;
  testDetails?: SortOrder;
  testParamRevision?: SortOrder;
  testParamUnits?: SortOrder;
  testPass?: SortOrder;
  testResult?: SortOrder;
  testSetpointBooleanValue?: SortOrder;
  testSetpointLowerLimit?: SortOrder;
  testSetpointType?: SortOrder;
  testSetpointUpperLimit?: SortOrder;
  testSetpointValue?: SortOrder;
  tooltip?: SortOrder;
};
