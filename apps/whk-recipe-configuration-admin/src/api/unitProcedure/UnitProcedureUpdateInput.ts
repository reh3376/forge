import { OperationUpdateManyWithoutUnitProceduresInput } from "./OperationUpdateManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type UnitProcedureUpdateInput = {
  createdBy?: string;
  description?: string | null;
  name?: string;
  operations?: OperationUpdateManyWithoutUnitProceduresInput;
  procedure?: ProcedureWhereUniqueInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
