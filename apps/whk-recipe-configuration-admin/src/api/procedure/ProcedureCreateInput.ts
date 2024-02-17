import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { ProcedureCreateNestedManyWithoutProceduresInput } from "./ProcedureCreateNestedManyWithoutProceduresInput";
import { UnitProcedureCreateNestedManyWithoutProceduresInput } from "./UnitProcedureCreateNestedManyWithoutProceduresInput";

export type ProcedureCreateInput = {
  active?: boolean | null;
  classId?: ProcedureWhereUniqueInput | null;
  createdBy: string;
  description?: string | null;
  instances?: ProcedureCreateNestedManyWithoutProceduresInput;
  isClassDefinition?: boolean | null;
  name?: string | null;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureCreateNestedManyWithoutProceduresInput;
  updatedBy?: string | null;
};
