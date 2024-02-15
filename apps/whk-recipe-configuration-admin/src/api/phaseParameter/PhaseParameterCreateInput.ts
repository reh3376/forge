import { EquipmentPhaseWhereUniqueInput } from "../equipmentPhase/EquipmentPhaseWhereUniqueInput";

export type PhaseParameterCreateInput = {
  createdBy: string;
  editedBy?: string | null;
  equipmentPhase?: EquipmentPhaseWhereUniqueInput | null;
  itemId?: string | null;
  recipeId?: string | null;
  schemaVersion?: string | null;
  setpointBooleanValue?: boolean | null;
  setpointLowerLimit?: number | null;
  setpointNumericalValue?: number | null;
  setpointType: "Boolean" | "Numeric";
  setpointUpperLimit?: number | null;
  typeDescription: string;
  typeName: string;
  typeRevision: number;
  typeUnits: string;
};
