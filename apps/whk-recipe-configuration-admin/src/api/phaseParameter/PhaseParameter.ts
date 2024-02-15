import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";

export type PhaseParameter = {
  createdAt: Date;
  createdBy: string;
  editedBy: string | null;
  equipmentPhase?: EquipmentPhase | null;
  id: string;
  itemId: string | null;
  recipeId: string | null;
  schemaVersion: string | null;
  setpointBooleanValue: boolean | null;
  setpointLowerLimit: number | null;
  setpointNumericalValue: number | null;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit: number | null;
  typeDescription: string;
  typeName: string;
  typeRevision: number;
  typeUnits: string;
  updatedAt: Date;
};
