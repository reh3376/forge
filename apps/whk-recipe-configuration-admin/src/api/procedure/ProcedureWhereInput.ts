import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { OperationListRelationFilter } from "../operation/OperationListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";

export type ProcedureWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  id?: StringFilter;
  name?: StringNullableFilter;
  operations?: OperationListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
