import { OperationCreateNestedManyWithoutUnitProceduresInput } from "./OperationCreateNestedManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type UnitProcedureCreateInput = {
  createdBy: string;
  description?: string | null;
  name: string;
  operations?: OperationCreateNestedManyWithoutUnitProceduresInput;
  procedure: ProcedureWhereUniqueInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
