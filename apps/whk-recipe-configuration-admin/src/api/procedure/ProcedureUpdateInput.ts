import { UnitProcedureUpdateManyWithoutProceduresInput } from "./UnitProcedureUpdateManyWithoutProceduresInput";

export type ProcedureUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  description?: string | null;
  name?: string | null;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureUpdateManyWithoutProceduresInput;
  updatedBy?: string | null;
};
