import { OperationStepUpdateManyWithoutInstructionsInput } from "./OperationStepUpdateManyWithoutInstructionsInput";
import { InputJsonValue } from "../../types";

export type InstructionUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  editedBy?: string | null;
  filePath?: string;
  instructionRevision?: number;
  operationStep?: OperationStepUpdateManyWithoutInstructionsInput;
  routes?: InputJsonValue;
  schemaVersion?: string;
};
