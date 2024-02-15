import { OperationStepUpdateManyWithoutOperationsInput } from "./OperationStepUpdateManyWithoutOperationsInput";
import { InputJsonValue } from "../../types";

export type OperationUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  editedBy?: string | null;
  globalUuid?: string | null;
  operationDescription?: string;
  operationName?: string;
  operationRevision?: number;
  operationSequenceNumber?: number;
  operationSteps?: OperationStepUpdateManyWithoutOperationsInput;
  route?: InputJsonValue;
  schemaVersion?: string | null;
};
