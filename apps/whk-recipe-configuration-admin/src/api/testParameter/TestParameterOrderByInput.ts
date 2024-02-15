import { SortOrder } from "../../util/SortOrder";

export type TestParameterOrderByInput = {
  active?: SortOrder;
  batch?: SortOrder;
  classId?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  isClassDef?: SortOrder;
  isDefinition?: SortOrder;
  itemId?: SortOrder;
  schemaVersion?: SortOrder;
  test?: SortOrder;
  testParamDescription?: SortOrder;
  testParamName?: SortOrder;
  testParamRevision?: SortOrder;
  testParamUnits?: SortOrder;
  testPass?: SortOrder;
  testResult?: SortOrder;
  testSetpointBooleanValue?: SortOrder;
  testSetpointLowerLimit?: SortOrder;
  testSetpointType?: SortOrder;
  testSetpointUpperLimit?: SortOrder;
  testSetpointValue?: SortOrder;
};
