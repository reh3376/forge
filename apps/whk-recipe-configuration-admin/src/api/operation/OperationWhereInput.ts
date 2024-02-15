import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { EquipmentPhaseListRelationFilter } from "../equipmentPhase/EquipmentPhaseListRelationFilter";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { IntFilter } from "../../util/IntFilter";

export type OperationWhereInput = {
  active?: BooleanNullableFilter;
  createdAt?: DateTimeNullableFilter;
  createdBy?: StringFilter;
  description?: StringFilter;
  editedBy?: StringNullableFilter;
  globalUuid?: StringNullableFilter;
  id?: StringFilter;
  name?: StringFilter;
  operationSteps?: EquipmentPhaseListRelationFilter;
  procedure?: ProcedureWhereUniqueInput;
  procedureSequenceIndex?: IntFilter;
  revision?: IntFilter;
  schemaVersion?: StringNullableFilter;
  updatedAt?: DateTimeNullableFilter;
};
