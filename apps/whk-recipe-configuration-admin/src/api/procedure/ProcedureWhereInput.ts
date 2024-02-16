import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { UnitProcedureListRelationFilter } from "../unitProcedure/UnitProcedureListRelationFilter";

export type ProcedureWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  id?: StringFilter;
  name?: StringNullableFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  unitProcedures?: UnitProcedureListRelationFilter;
  updatedBy?: StringNullableFilter;
};
