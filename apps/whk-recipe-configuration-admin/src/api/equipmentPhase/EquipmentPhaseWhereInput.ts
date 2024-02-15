import { StringNullableFilter } from "../../util/StringNullableFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { InstructionListRelationFilter } from "../instruction/InstructionListRelationFilter";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { PhaseParameterListRelationFilter } from "../phaseParameter/PhaseParameterListRelationFilter";
import { TestParameterWhereUniqueInput } from "../testParameter/TestParameterWhereUniqueInput";

export type EquipmentPhaseWhereInput = {
  bomId?: StringNullableFilter;
  className?: StringNullableFilter;
  createdAt?: DateTimeNullableFilter;
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  editedAt?: DateTimeNullableFilter;
  editedBy?: StringNullableFilter;
  id?: StringFilter;
  instructions?: InstructionListRelationFilter;
  name?: StringFilter;
  operations?: OperationWhereUniqueInput;
  operationSequenceIndex?: BooleanNullableFilter;
  operationStepSequence?: IntNullableFilter;
  phaseParameters?: PhaseParameterListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  testParameters?: TestParameterWhereUniqueInput;
};
