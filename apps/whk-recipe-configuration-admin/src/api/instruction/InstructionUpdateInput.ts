import { EquipmentPhaseUpdateManyWithoutInstructionsInput } from "./EquipmentPhaseUpdateManyWithoutInstructionsInput";

export type InstructionUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  editedBy?: string | null;
  equipmentPhase?: EquipmentPhaseUpdateManyWithoutInstructionsInput;
  filePath?: string;
  name?: string | null;
  revision?: number;
  schemaVersion?: string;
};
