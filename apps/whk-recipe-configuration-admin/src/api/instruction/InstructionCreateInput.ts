import { EquipmentPhaseCreateNestedManyWithoutInstructionsInput } from "./EquipmentPhaseCreateNestedManyWithoutInstructionsInput";

export type InstructionCreateInput = {
  active?: boolean | null;
  createdBy: string;
  editedBy?: string | null;
  equipmentPhase?: EquipmentPhaseCreateNestedManyWithoutInstructionsInput;
  filePath: string;
  instructionRevision: number;
  schemaVersion: string;
};
