import { StringFilter } from "../../util/StringFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { EquipmentPhaseListRelationFilter } from "../equipmentPhase/EquipmentPhaseListRelationFilter";
import { UnitProcedureListRelationFilter } from "../unitProcedure/UnitProcedureListRelationFilter";

export type BomWhereInput = {
  bomName?: StringFilter;
  bomRevision?: IntNullableFilter;
  className?: StringNullableFilter;
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  equipmentPhases?: EquipmentPhaseListRelationFilter;
  id?: StringFilter;
  schemaVersion?: StringNullableFilter;
  unitProcedure?: UnitProcedureListRelationFilter;
  unitProceduresPrimary?: UnitProcedureListRelationFilter;
  wipItemId?: StringNullableFilter;
};
