import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";
import { UnitProcedure } from "../unitProcedure/UnitProcedure";

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
  unitProcedure?: Array<UnitProcedure>;
  unitProceduresPrimary?: Array<UnitProcedure>;
  wipItemId: string | null;
};
