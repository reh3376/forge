import { EquipmentPhaseUpdateManyWithoutInstructionsInput } from "./EquipmentPhaseUpdateManyWithoutInstructionsInput";

export type InstructionUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  editedBy?: string | null;
  equipmentPhase?: EquipmentPhaseUpdateManyWithoutInstructionsInput;
  filePath?: string;
  instructionRevision?: number;
  schemaVersion?: string;
};
