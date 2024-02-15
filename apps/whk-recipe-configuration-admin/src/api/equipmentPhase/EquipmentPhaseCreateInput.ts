import { InstructionCreateNestedManyWithoutEquipmentPhasesInput } from "./InstructionCreateNestedManyWithoutEquipmentPhasesInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput } from "./PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput";
import { TestParameterWhereUniqueInput } from "../testParameter/TestParameterWhereUniqueInput";

export type EquipmentPhaseCreateInput = {
  bomId?: string | null;
  className?: string | null;
  createdBy: string;
  description?: string | null;
  editedBy?: string | null;
  instructions?: InstructionCreateNestedManyWithoutEquipmentPhasesInput;
  name: string;
  operations: OperationWhereUniqueInput;
  operationSequenceIndex?: boolean | null;
  operationStepSequence?: number | null;
  phaseParameters?: PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  testParameters?: TestParameterWhereUniqueInput | null;
};
