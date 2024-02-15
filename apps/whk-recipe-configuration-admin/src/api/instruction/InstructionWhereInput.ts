import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { IntFilter } from "../../util/IntFilter";
import { OperationStepListRelationFilter } from "../operationStep/OperationStepListRelationFilter";
import { JsonFilter } from "../../util/JsonFilter";

export type InstructionWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  filePath?: StringFilter;
  id?: StringFilter;
  instructionRevision?: IntFilter;
  operationStep?: OperationStepListRelationFilter;
  routes?: JsonFilter;
  schemaVersion?: StringFilter;
};
