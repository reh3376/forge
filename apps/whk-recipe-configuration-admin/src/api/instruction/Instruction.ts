import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";

export type Instruction = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  editedBy: string | null;
  equipmentPhase?: Array<EquipmentPhase>;
  filePath: string;
  id: string;
  name: string | null;
  revision: number;
  schemaVersion: string;
  updatedAt: Date;
};
