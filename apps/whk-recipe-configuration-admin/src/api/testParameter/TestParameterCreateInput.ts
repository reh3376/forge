import { TestParameterWhereUniqueInput } from "./TestParameterWhereUniqueInput";
import { EquipmentPhaseCreateNestedManyWithoutTestParametersInput } from "./EquipmentPhaseCreateNestedManyWithoutTestParametersInput";
import { TestParameterCreateNestedManyWithoutTestParametersInput } from "./TestParameterCreateNestedManyWithoutTestParametersInput";
import { InputJsonValue } from "../../types";

export type TestParameterCreateInput = {
  active: boolean;
  classId?: TestParameterWhereUniqueInput | null;
  createdBy: string;
  description?: string | null;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseCreateNestedManyWithoutTestParametersInput;
  instances?: TestParameterCreateNestedManyWithoutTestParametersInput;
  isClassDef?: boolean | null;
  name: string;
  schemaVersion?: string | null;
  testDetails?: string | null;
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
