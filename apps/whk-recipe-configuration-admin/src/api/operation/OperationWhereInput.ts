import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { IntFilter } from "../../util/IntFilter";
import { OperationStepListRelationFilter } from "../operationStep/OperationStepListRelationFilter";
import { JsonFilter } from "../../util/JsonFilter";

export type OperationWhereInput = {
  active?: BooleanNullableFilter;
  createdAt?: DateTimeNullableFilter;
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  globalUuid?: StringNullableFilter;
  id?: StringFilter;
  operationDescription?: StringFilter;
  operationName?: StringFilter;
  operationRevision?: IntFilter;
  operationSequenceNumber?: IntFilter;
  operationSteps?: OperationStepListRelationFilter;
  route?: JsonFilter;
  schemaVersion?: StringNullableFilter;
  updatedAt?: DateTimeNullableFilter;
};
