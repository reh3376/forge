import { InstructionUpdateManyWithoutEquipmentPhasesInput } from "./InstructionUpdateManyWithoutEquipmentPhasesInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { PhaseParameterUpdateManyWithoutEquipmentPhasesInput } from "./PhaseParameterUpdateManyWithoutEquipmentPhasesInput";
import { TestParameterWhereUniqueInput } from "../testParameter/TestParameterWhereUniqueInput";

export type EquipmentPhaseUpdateInput = {
  bomId?: string | null;
  className?: string | null;
  createdBy?: string;
  description?: string | null;
  editedBy?: string | null;
  instructions?: InstructionUpdateManyWithoutEquipmentPhasesInput;
  isClassDefinition?: boolean | null;
  name?: string;
  operations?: OperationWhereUniqueInput;
  operationSequenceIndex?: boolean | null;
  operationStepSequence?: number | null;
  phaseParameters?: PhaseParameterUpdateManyWithoutEquipmentPhasesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  testParameters?: TestParameterWhereUniqueInput | null;
};
