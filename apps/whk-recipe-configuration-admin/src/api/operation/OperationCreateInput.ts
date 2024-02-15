import { OperationStepCreateNestedManyWithoutOperationsInput } from "./OperationStepCreateNestedManyWithoutOperationsInput";
import { InputJsonValue } from "../../types";

export type OperationCreateInput = {
  active?: boolean | null;
  createdBy: string;
  editedBy?: string | null;
  globalUuid?: string | null;
  operationDescription: string;
  operationName: string;
  operationRevision: number;
  operationSequenceNumber: number;
  operationSteps?: OperationStepCreateNestedManyWithoutOperationsInput;
  route?: InputJsonValue;
  schemaVersion?: string | null;
};
