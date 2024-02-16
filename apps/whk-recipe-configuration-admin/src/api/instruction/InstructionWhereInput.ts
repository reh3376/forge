import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { EquipmentPhaseListRelationFilter } from "../equipmentPhase/EquipmentPhaseListRelationFilter";
import { IntFilter } from "../../util/IntFilter";

export type InstructionWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  equipmentPhase?: EquipmentPhaseListRelationFilter;
  filePath?: StringFilter;
  id?: StringFilter;
  name?: StringNullableFilter;
  revision?: IntFilter;
  schemaVersion?: StringFilter;
};
