import { JsonFilter } from "../../util/JsonFilter";
import { StringFilter } from "../../util/StringFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { EquipmentPhaseListRelationFilter } from "../equipmentPhase/EquipmentPhaseListRelationFilter";

export type BomWhereInput = {
  batches?: JsonFilter;
  bomItems?: JsonFilter;
  bomName?: StringFilter;
  bomRevision?: IntNullableFilter;
  className?: StringNullableFilter;
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  equipmentPhases?: EquipmentPhaseListRelationFilter;
  id?: StringFilter;
  operationSteps?: JsonFilter;
  schemaVersion?: StringNullableFilter;
  wipItemId?: StringNullableFilter;
};
