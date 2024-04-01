import { BomWhereUniqueInput } from "../bom/BomWhereUniqueInput";
import { UnitProcedureWhereUniqueInput } from "./UnitProcedureWhereUniqueInput";
import { UnitProcedureUpdateManyWithoutUnitProceduresInput } from "./UnitProcedureUpdateManyWithoutUnitProceduresInput";
import { OperationUpdateManyWithoutUnitProceduresInput } from "./OperationUpdateManyWithoutUnitProceduresInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { RecipeUpdateManyWithoutUnitProceduresInput } from "./RecipeUpdateManyWithoutUnitProceduresInput";

export type UnitProcedureUpdateInput = {
  active?: boolean | null;
  boms?: BomWhereUniqueInput | null;
  classId?: UnitProcedureWhereUniqueInput | null;
  createdBy?: string;
  description?: string | null;
  instances?: UnitProcedureUpdateManyWithoutUnitProceduresInput;
  isClassDef?: boolean | null;
  name?:
    | "Mashing01"
    | "Fermentation01"
    | "Distillation01"
    | "Processing01"
    | "Granary01";
  operations?: OperationUpdateManyWithoutUnitProceduresInput;
  primaryBom?: BomWhereUniqueInput | null;
  procedure?: ProcedureWhereUniqueInput;
  recipe?: RecipeUpdateManyWithoutUnitProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
