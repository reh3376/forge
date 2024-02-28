import { EquipmentPhaseUpdateManyWithoutBomsInput } from "./EquipmentPhaseUpdateManyWithoutBomsInput";

export type BomUpdateInput = {
  bomName?: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy?: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutBomsInput;
  schemaVersion?: string | null;
  wipItemId?: string | null;
};
