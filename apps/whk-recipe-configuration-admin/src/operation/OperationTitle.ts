import { Operation as TOperation } from "../api/operation/Operation";

export const OPERATION_TITLE_FIELD = "name";

export const OperationTitle = (record: TOperation): string => {
  return record.name?.toString() || String(record.id);
};
