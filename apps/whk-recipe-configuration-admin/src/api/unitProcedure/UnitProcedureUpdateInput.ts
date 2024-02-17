import { UnitProcedureWhereUniqueInput } from "./UnitProcedureWhereUniqueInput";
import { UnitProcedureUpdateManyWithoutUnitProceduresInput } from "./UnitProcedureUpdateManyWithoutUnitProceduresInput";
import { OperationUpdateManyWithoutUnitProceduresInput } from "./OperationUpdateManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type UnitProcedureUpdateInput = {
  active?: boolean | null;
  classId?: UnitProcedureWhereUniqueInput | null;
  createdBy?: string;
  description?: string | null;
  instances?: UnitProcedureUpdateManyWithoutUnitProceduresInput;
  isClassDef?: boolean | null;
  name?: string;
  operations?: OperationUpdateManyWithoutUnitProceduresInput;
  procedure?: ProcedureWhereUniqueInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
