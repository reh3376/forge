import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { BomWhereUniqueInput } from "../bom/BomWhereUniqueInput";
import { UnitProcedureWhereUniqueInput } from "./UnitProcedureWhereUniqueInput";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { UnitProcedureListRelationFilter } from "./UnitProcedureListRelationFilter";
import { OperationListRelationFilter } from "../operation/OperationListRelationFilter";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { RecipeListRelationFilter } from "../recipe/RecipeListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";

export type UnitProcedureWhereInput = {
  active?: BooleanNullableFilter;
  boms?: BomWhereUniqueInput;
  classId?: UnitProcedureWhereUniqueInput;
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  id?: StringFilter;
  instances?: UnitProcedureListRelationFilter;
  isClassDef?: BooleanNullableFilter;
  name?:
    | "Mashing01"
    | "Fermentation01"
    | "Distillation01"
    | "Processing01"
    | "Granary01";
  operations?: OperationListRelationFilter;
  primaryBom?: BomWhereUniqueInput;
  procedure?: ProcedureWhereUniqueInput;
  recipe?: RecipeListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
