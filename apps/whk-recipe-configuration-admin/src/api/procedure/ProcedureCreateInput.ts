import { OperationCreateNestedManyWithoutProceduresInput } from "./OperationCreateNestedManyWithoutProceduresInput";

export type ProcedureCreateInput = {
  active?: boolean | null;
  createdBy: string;
  description?: string | null;
  name?: string | null;
  operations?: OperationCreateNestedManyWithoutProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
