import { ProcedureWhereInput } from "./ProcedureWhereInput";
import { ProcedureOrderByInput } from "./ProcedureOrderByInput";

export type ProcedureFindManyArgs = {
  where?: ProcedureWhereInput;
  orderBy?: Array<ProcedureOrderByInput>;
  skip?: number;
  take?: number;
};
