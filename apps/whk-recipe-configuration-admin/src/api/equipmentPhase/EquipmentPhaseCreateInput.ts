import { BomWhereUniqueInput } from "../bom/BomWhereUniqueInput";
import { EquipmentPhaseWhereUniqueInput } from "./EquipmentPhaseWhereUniqueInput";
import { EquipmentPhaseCreateNestedManyWithoutEquipmentPhasesInput } from "./EquipmentPhaseCreateNestedManyWithoutEquipmentPhasesInput";
import { InstructionCreateNestedManyWithoutEquipmentPhasesInput } from "./InstructionCreateNestedManyWithoutEquipmentPhasesInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput } from "./PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput";
import { TestParameterWhereUniqueInput } from "../testParameter/TestParameterWhereUniqueInput";

export type EquipmentPhaseCreateInput = {
  bom?: BomWhereUniqueInput | null;
  classId?: EquipmentPhaseWhereUniqueInput | null;
  className?: string | null;
  createdBy: string;
  description?: string | null;
  editedBy?: string | null;
  instances?: EquipmentPhaseCreateNestedManyWithoutEquipmentPhasesInput;
  instructions?: InstructionCreateNestedManyWithoutEquipmentPhasesInput;
  isClassDefinition?: boolean | null;
  name: string;
  operations: OperationWhereUniqueInput;
  operationSequenceIndex?: boolean | null;
  operationStepSequence?: number | null;
  phaseParameters?: PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  testParameters?: TestParameterWhereUniqueInput | null;
};
