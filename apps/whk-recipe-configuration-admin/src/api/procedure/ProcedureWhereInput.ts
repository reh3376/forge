import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { ProcedureListRelationFilter } from "./ProcedureListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { UnitProcedureListRelationFilter } from "../unitProcedure/UnitProcedureListRelationFilter";

export type ProcedureWhereInput = {
  active?: BooleanNullableFilter;
  classId?: ProcedureWhereUniqueInput;
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  id?: StringFilter;
  isClassDefinition?: BooleanNullableFilter;
  name?: StringNullableFilter;
  procedures?: ProcedureListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  unitProcedures?: UnitProcedureListRelationFilter;
  updatedBy?: StringNullableFilter;
};
