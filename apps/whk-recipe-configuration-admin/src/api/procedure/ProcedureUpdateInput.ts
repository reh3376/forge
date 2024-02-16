import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { ProcedureUpdateManyWithoutProceduresInput } from "./ProcedureUpdateManyWithoutProceduresInput";
import { UnitProcedureUpdateManyWithoutProceduresInput } from "./UnitProcedureUpdateManyWithoutProceduresInput";

export type ProcedureUpdateInput = {
  active?: boolean | null;
  classId?: ProcedureWhereUniqueInput | null;
  createdBy?: string;
  description?: string | null;
  isClassDefinition?: boolean | null;
  name?: string | null;
  procedures?: ProcedureUpdateManyWithoutProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureUpdateManyWithoutProceduresInput;
  updatedBy?: string | null;
};
