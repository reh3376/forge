import { PhaseParameterWhereUniqueInput } from "./PhaseParameterWhereUniqueInput";
import { EquipmentPhaseWhereUniqueInput } from "../equipmentPhase/EquipmentPhaseWhereUniqueInput";
import { PhaseParameterUpdateManyWithoutPhaseParametersInput } from "./PhaseParameterUpdateManyWithoutPhaseParametersInput";

export type PhaseParameterUpdateInput = {
  active?: boolean | null;
  classId?: PhaseParameterWhereUniqueInput | null;
  createdBy?: string;
  description?: string;
  editedBy?: string | null;
  equipmentPhase?: EquipmentPhaseWhereUniqueInput | null;
  isClassDef?: boolean | null;
  itemId?: string | null;
  name?: string;
  phaseParameters?: PhaseParameterUpdateManyWithoutPhaseParametersInput;
  recipeId?: string | null;
  revision?: number | null;
  schemaVersion?: string | null;
  setpointBooleanValue?: boolean | null;
  setpointLowerLimit?: number | null;
  setpointNumericalValue?: number | null;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit?: number | null;
  units?: string;
};
