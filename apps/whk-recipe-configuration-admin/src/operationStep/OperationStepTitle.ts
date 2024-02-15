import { OperationStep as TOperationStep } from "../api/operationStep/OperationStep";

export const OPERATIONSTEP_TITLE_FIELD = "className";

export const OperationStepTitle = (record: TOperationStep): string => {
  return record.className?.toString() || String(record.id);
};
