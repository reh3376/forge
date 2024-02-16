import { Procedure as TProcedure } from "../api/procedure/Procedure";

export const PROCEDURE_TITLE_FIELD = "name";

export const ProcedureTitle = (record: TProcedure): string => {
  return record.name?.toString() || String(record.id);
};
