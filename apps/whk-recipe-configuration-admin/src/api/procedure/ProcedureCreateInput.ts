import { UnitProcedureCreateNestedManyWithoutProceduresInput } from "./UnitProcedureCreateNestedManyWithoutProceduresInput";

export type ProcedureCreateInput = {
  active?: boolean | null;
  createdBy: string;
  description?: string | null;
  name?: string | null;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureCreateNestedManyWithoutProceduresInput;
  updatedBy?: string | null;
};
