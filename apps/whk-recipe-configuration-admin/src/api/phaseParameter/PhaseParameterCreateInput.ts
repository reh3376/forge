import { PhaseParameterWhereUniqueInput } from "./PhaseParameterWhereUniqueInput";
import { EquipmentPhaseWhereUniqueInput } from "../equipmentPhase/EquipmentPhaseWhereUniqueInput";
import { PhaseParameterCreateNestedManyWithoutPhaseParametersInput } from "./PhaseParameterCreateNestedManyWithoutPhaseParametersInput";

export type PhaseParameterCreateInput = {
  active?: boolean | null;
  classId?: PhaseParameterWhereUniqueInput | null;
  createdBy: string;
  description: string;
  editedBy?: string | null;
  equipmentPhase?: EquipmentPhaseWhereUniqueInput | null;
  isClassDef?: boolean | null;
  itemId?: string | null;
  name: string;
  phaseParameters?: PhaseParameterCreateNestedManyWithoutPhaseParametersInput;
  recipeId?: string | null;
  revision?: number | null;
  schemaVersion?: string | null;
  setpointBooleanValue?: boolean | null;
  setpointLowerLimit?: number | null;
  setpointNumericalValue?: number | null;
  setpointType: "Boolean" | "Numeric";
  setpointUpperLimit?: number | null;
  units: string;
};
