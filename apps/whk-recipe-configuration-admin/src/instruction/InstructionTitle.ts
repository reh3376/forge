import { Instruction as TInstruction } from "../api/instruction/Instruction";

export const INSTRUCTION_TITLE_FIELD = "name";

export const InstructionTitle = (record: TInstruction): string => {
  return record.name?.toString() || String(record.id);
};
