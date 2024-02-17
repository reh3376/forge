import { BomWhereUniqueInput } from "../bom/BomWhereUniqueInput";
import { EquipmentPhaseWhereUniqueInput } from "./EquipmentPhaseWhereUniqueInput";
import { EquipmentPhaseUpdateManyWithoutEquipmentPhasesInput } from "./EquipmentPhaseUpdateManyWithoutEquipmentPhasesInput";
import { InstructionUpdateManyWithoutEquipmentPhasesInput } from "./InstructionUpdateManyWithoutEquipmentPhasesInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { PhaseParameterUpdateManyWithoutEquipmentPhasesInput } from "./PhaseParameterUpdateManyWithoutEquipmentPhasesInput";
import { TestParameterWhereUniqueInput } from "../testParameter/TestParameterWhereUniqueInput";

export type EquipmentPhaseUpdateInput = {
  bom?: BomWhereUniqueInput | null;
  classId?: EquipmentPhaseWhereUniqueInput | null;
  className?: string | null;
  createdBy?: string;
  description?: string | null;
  editedBy?: string | null;
  instances?: EquipmentPhaseUpdateManyWithoutEquipmentPhasesInput;
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
