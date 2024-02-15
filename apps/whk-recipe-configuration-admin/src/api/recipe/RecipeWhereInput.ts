import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";

export type RecipeWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  id?: StringFilter;
  operation?: OperationWhereUniqueInput;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: DateTimeNullableFilter;
};
