import { OperationStepCreateNestedManyWithoutInstructionsInput } from "./OperationStepCreateNestedManyWithoutInstructionsInput";
import { InputJsonValue } from "../../types";

export type InstructionCreateInput = {
  active?: boolean | null;
  createdBy: string;
  editedBy?: string | null;
  filePath: string;
  instructionRevision: number;
  operationStep?: OperationStepCreateNestedManyWithoutInstructionsInput;
  routes?: InputJsonValue;
  schemaVersion: string;
};
