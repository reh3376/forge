import { EquipmentPhaseCreateNestedManyWithoutBomsInput } from "./EquipmentPhaseCreateNestedManyWithoutBomsInput";

export type BomCreateInput = {
  bomName: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseCreateNestedManyWithoutBomsInput;
  schemaVersion?: string | null;
  wipItemId?: string | null;
};
