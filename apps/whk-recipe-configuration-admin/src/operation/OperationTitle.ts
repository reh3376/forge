import { Operation as TOperation } from "../api/operation/Operation";

export const OPERATION_TITLE_FIELD = "operationName";

export const OperationTitle = (record: TOperation): string => {
  return record.operationName?.toString() || String(record.id);
};
