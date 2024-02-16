import { UnitProcedureWhereInput } from "./UnitProcedureWhereInput";
import { UnitProcedureOrderByInput } from "./UnitProcedureOrderByInput";

export type UnitProcedureFindManyArgs = {
  where?: UnitProcedureWhereInput;
  orderBy?: Array<UnitProcedureOrderByInput>;
  skip?: number;
  take?: number;
};
