import { StringNullableFilter } from "../../util/StringNullableFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { InstructionListRelationFilter } from "../instruction/InstructionListRelationFilter";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { JsonFilter } from "../../util/JsonFilter";

export type OperationStepWhereInput = {
  bomId?: StringNullableFilter;
  className?: StringNullableFilter;
  createdAt?: DateTimeNullableFilter;
  createdBy?: StringFilter;
  editedAt?: DateTimeNullableFilter;
  editedBy?: StringNullableFilter;
  id?: StringFilter;
  instructions?: InstructionListRelationFilter;
  operations?: OperationWhereUniqueInput;
  operationStepDescription?: StringNullableFilter;
  operationStepName?: StringFilter;
  operationStepRevision?: IntNullableFilter;
  operationStepSequence?: IntNullableFilter;
  recipeId?: StringNullableFilter;
  schemaVersion?: StringNullableFilter;
  sequenceOperation?: BooleanNullableFilter;
  tests?: JsonFilter;
};
