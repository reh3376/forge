import { BomWhereUniqueInput } from "../bom/BomWhereUniqueInput";
import { EquipmentPhaseWhereUniqueInput } from "./EquipmentPhaseWhereUniqueInput";
import { EquipmentPhaseCreateNestedManyWithoutEquipmentPhasesInput } from "./EquipmentPhaseCreateNestedManyWithoutEquipmentPhasesInput";
import { InstructionCreateNestedManyWithoutEquipmentPhasesInput } from "./InstructionCreateNestedManyWithoutEquipmentPhasesInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput } from "./PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput";
import { TestParameterCreateNestedManyWithoutEquipmentPhasesInput } from "./TestParameterCreateNestedManyWithoutEquipmentPhasesInput";

export type EquipmentPhaseCreateInput = {
  active?: boolean | null;
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
  operationSequenceIndex?: number | null;
  phaseParameters?: PhaseParameterCreateNestedManyWithoutEquipmentPhasesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  testParameters?: TestParameterCreateNestedManyWithoutEquipmentPhasesInput;
};
