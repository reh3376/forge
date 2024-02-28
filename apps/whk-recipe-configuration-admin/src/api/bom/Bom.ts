import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";

export type Bom = {
  bomName: string;
  bomRevision: number | null;
  className: string | null;
  createdAt: Date;
  createdBy: string;
  editedAt: Date;
  editedBy: string | null;
  equipmentPhases?: Array<EquipmentPhase>;
  id: string;
  schemaVersion: string | null;
  wipItemId: string | null;
};
