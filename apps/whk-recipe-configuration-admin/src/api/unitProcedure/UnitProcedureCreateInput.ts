import { UnitProcedureWhereUniqueInput } from "./UnitProcedureWhereUniqueInput";
import { OperationCreateNestedManyWithoutUnitProceduresInput } from "./OperationCreateNestedManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { UnitProcedureCreateNestedManyWithoutUnitProceduresInput } from "./UnitProcedureCreateNestedManyWithoutUnitProceduresInput";

export type UnitProcedureCreateInput = {
  classId?: UnitProcedureWhereUniqueInput | null;
  createdBy: string;
  description?: string | null;
  isClassDef?: boolean | null;
  name: string;
  operations?: OperationCreateNestedManyWithoutUnitProceduresInput;
  procedure: ProcedureWhereUniqueInput;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureCreateNestedManyWithoutUnitProceduresInput;
  updatedBy?: string | null;
};
