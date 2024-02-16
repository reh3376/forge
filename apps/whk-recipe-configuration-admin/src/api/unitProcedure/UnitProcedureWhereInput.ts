import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { OperationListRelationFilter } from "../operation/OperationListRelationFilter";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { IntNullableFilter } from "../../util/IntNullableFilter";

export type UnitProcedureWhereInput = {
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  id?: StringFilter;
  name?: StringFilter;
  operations?: OperationListRelationFilter;
  procedure?: ProcedureWhereUniqueInput;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
