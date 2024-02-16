import { UnitProcedureWhereUniqueInput } from "./UnitProcedureWhereUniqueInput";
import { OperationUpdateManyWithoutUnitProceduresInput } from "./OperationUpdateManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { UnitProcedureUpdateManyWithoutUnitProceduresInput } from "./UnitProcedureUpdateManyWithoutUnitProceduresInput";

export type UnitProcedureUpdateInput = {
  classId?: UnitProcedureWhereUniqueInput | null;
  createdBy?: string;
  description?: string | null;
  isClassDef?: boolean | null;
  name?: string;
  operations?: OperationUpdateManyWithoutUnitProceduresInput;
  procedure?: ProcedureWhereUniqueInput;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureUpdateManyWithoutUnitProceduresInput;
  updatedBy?: string | null;
};
