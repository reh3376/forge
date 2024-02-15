import { EquipmentPhaseUpdateManyWithoutTestParametersInput } from "./EquipmentPhaseUpdateManyWithoutTestParametersInput";
import { InputJsonValue } from "../../types";

export type TestParameterUpdateInput = {
  active?: boolean;
  batch?: string | null;
  className?: string;
  createdBy?: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutTestParametersInput;
  isDefinition?: boolean | null;
  itemId?: string;
  schemaVersion?: string | null;
  test?: InputJsonValue;
  testParamDescription?: string | null;
  testParamName?: string;
  testParamRevision?: string | null;
  testParamUnits?: "Lbs" | "Perc" | "Gal" | "Bu" | "PassFail" | null;
  testPass?: boolean | null;
  testResult?: string | null;
  testSetpointBooleanValue?: boolean | null;
  testSetpointLowerLimit?: number | null;
  testSetpointType?: "Boolean" | "Numerical" | null;
  testSetpointUpperLimit?: number | null;
  testSetpointValue?: number | null;
};
