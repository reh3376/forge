import { EquipmentPhaseWhereUniqueInput } from "./EquipmentPhaseWhereUniqueInput";
import { EquipmentPhaseUpdateManyWithoutEquipmentPhasesInput } from "./EquipmentPhaseUpdateManyWithoutEquipmentPhasesInput";
import { InstructionUpdateManyWithoutEquipmentPhasesInput } from "./InstructionUpdateManyWithoutEquipmentPhasesInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { PhaseParameterUpdateManyWithoutEquipmentPhasesInput } from "./PhaseParameterUpdateManyWithoutEquipmentPhasesInput";
import { TestParameterUpdateManyWithoutEquipmentPhasesInput } from "./TestParameterUpdateManyWithoutEquipmentPhasesInput";

export type EquipmentPhaseUpdateInput = {
  active?: boolean | null;
  classId?: EquipmentPhaseWhereUniqueInput | null;
  className?: string | null;
  createdBy?: string;
  description?: string | null;
  editedBy?: string | null;
  instances?: EquipmentPhaseUpdateManyWithoutEquipmentPhasesInput;
  instructions?: InstructionUpdateManyWithoutEquipmentPhasesInput;
  isClassDefinition?: boolean | null;
  name?: "IngredientAdd" | "PreSteam" | "Steam" | "Hold";
  operation?: OperationWhereUniqueInput;
  operationSequenceIndex?: number | null;
  phaseParameters?: PhaseParameterUpdateManyWithoutEquipmentPhasesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  testParameters?: TestParameterUpdateManyWithoutEquipmentPhasesInput;
};
