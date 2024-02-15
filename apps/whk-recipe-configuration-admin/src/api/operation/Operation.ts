import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";
import { Procedure } from "../procedure/Procedure";

export type Operation = {
  active: boolean | null;
  createdAt: Date | null;
  createdBy: string;
  description: string;
  editedBy: string | null;
  globalUuid: string | null;
  id: string;
  name: string;
  operationSteps?: Array<EquipmentPhase>;
  procedure?: Procedure | null;
  procedureSequenceIndex: number;
  revision: number;
  schemaVersion: string | null;
  updatedAt: Date | null;
};
