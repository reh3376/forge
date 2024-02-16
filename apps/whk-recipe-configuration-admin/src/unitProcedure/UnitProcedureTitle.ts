import { UnitProcedure as TUnitProcedure } from "../api/unitProcedure/UnitProcedure";

export const UNITPROCEDURE_TITLE_FIELD = "name";

export const UnitProcedureTitle = (record: TUnitProcedure): string => {
  return record.name?.toString() || String(record.id);
};
