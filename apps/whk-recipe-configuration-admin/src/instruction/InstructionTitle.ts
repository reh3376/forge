import { Instruction as TInstruction } from "../api/instruction/Instruction";

export const INSTRUCTION_TITLE_FIELD = "filePath";

export const InstructionTitle = (record: TInstruction): string => {
  return record.filePath?.toString() || String(record.id);
};
