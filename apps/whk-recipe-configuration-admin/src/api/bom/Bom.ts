import { JsonValue } from "type-fest";
import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";

export type Bom = {
  batches: JsonValue;
  bomItems: JsonValue;
  bomName: string;
  bomRevision: number | null;
  className: string | null;
  createdAt: Date;
  createdBy: string;
  editedAt: Date;
  editedBy: string | null;
  equipmentPhases?: Array<EquipmentPhase>;
  id: string;
  operationSteps: JsonValue;
  schemaVersion: string | null;
  wipItemId: string | null;
};
