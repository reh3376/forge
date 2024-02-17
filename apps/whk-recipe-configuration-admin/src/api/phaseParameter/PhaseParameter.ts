import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";

export type PhaseParameter = {
  active: boolean | null;
  classId?: PhaseParameter | null;
  createdAt: Date;
  createdBy: string;
  description: string;
  editedBy: string | null;
  equipmentPhase?: EquipmentPhase | null;
  id: string;
  instances?: Array<PhaseParameter>;
  isClassDef: boolean | null;
  itemId: string | null;
  name: string;
  recipeId: string | null;
  revision: number | null;
  schemaVersion: string | null;
  setpointBooleanValue: boolean | null;
  setpointLowerLimit: number | null;
  setpointNumericalValue: number | null;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit: number | null;
  units: string;
  updatedAt: Date;
};
