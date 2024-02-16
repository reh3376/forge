import { EquipmentPhase as TEquipmentPhase } from "../api/equipmentPhase/EquipmentPhase";

export const EQUIPMENTPHASE_TITLE_FIELD = "className";

export const EquipmentPhaseTitle = (record: TEquipmentPhase): string => {
  return record.className?.toString() || String(record.id);
};
