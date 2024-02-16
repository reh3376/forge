import { TestParameterWhereUniqueInput } from "./TestParameterWhereUniqueInput";
import { EquipmentPhaseUpdateManyWithoutTestParametersInput } from "./EquipmentPhaseUpdateManyWithoutTestParametersInput";
import { TestParameterUpdateManyWithoutTestParametersInput } from "./TestParameterUpdateManyWithoutTestParametersInput";
import { InputJsonValue } from "../../types";

export type TestParameterUpdateInput = {
  active?: boolean;
  classId?: TestParameterWhereUniqueInput | null;
  createdBy?: string;
  description?: string | null;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutTestParametersInput;
  isClassDef?: boolean | null;
  name?: string;
  schemaVersion?: string | null;
  testDetails?: string | null;
  testParameters?: TestParameterUpdateManyWithoutTestParametersInput;
  testParamRevision?: string | null;
  testParamUnits?: "Lbs" | "Perc" | "Gal" | "Bu" | "PassFail" | null;
  testPass?: boolean | null;
  testResult?: InputJsonValue;
  testSetpointBooleanValue?: boolean | null;
  testSetpointLowerLimit?: number | null;
  testSetpointType?: "Boolean" | "Numerical" | null;
  testSetpointUpperLimit?: number | null;
  testSetpointValue?: number | null;
  tooltip?: string | null;
};
