import { UnitProcedureWhereUniqueInput } from "./UnitProcedureWhereUniqueInput";
import { UnitProcedureCreateNestedManyWithoutUnitProceduresInput } from "./UnitProcedureCreateNestedManyWithoutUnitProceduresInput";
import { OperationCreateNestedManyWithoutUnitProceduresInput } from "./OperationCreateNestedManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type UnitProcedureCreateInput = {
  active?: boolean | null;
  classId?: UnitProcedureWhereUniqueInput | null;
  createdBy: string;
  description?: string | null;
  instances?: UnitProcedureCreateNestedManyWithoutUnitProceduresInput;
  isClassDef?: boolean | null;
  name:
    | "Mashing01"
    | "Fermentation01"
    | "Distillation01"
    | "Processing01"
    | "Granary01";
  operations?: OperationCreateNestedManyWithoutUnitProceduresInput;
  procedure: ProcedureWhereUniqueInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
