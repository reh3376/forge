import { OperationUpdateManyWithoutProceduresInput } from "./OperationUpdateManyWithoutProceduresInput";

export type ProcedureUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  description?: string | null;
  name?: string | null;
  operations?: OperationUpdateManyWithoutProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
