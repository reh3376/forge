import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { ProcedureCreateNestedManyWithoutProceduresInput } from "./ProcedureCreateNestedManyWithoutProceduresInput";
import { UnitProcedureCreateNestedManyWithoutProceduresInput } from "./UnitProcedureCreateNestedManyWithoutProceduresInput";

export type ProcedureCreateInput = {
  active?: boolean | null;
  classId?: ProcedureWhereUniqueInput | null;
  createdBy: string;
  description?: string | null;
  isClassDefinition?: boolean | null;
  name?: string | null;
  procedures?: ProcedureCreateNestedManyWithoutProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureCreateNestedManyWithoutProceduresInput;
  updatedBy?: string | null;
};
