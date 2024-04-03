import { StringFilter } from "../../util/StringFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { UnitProcedureListRelationFilter } from "../unitProcedure/UnitProcedureListRelationFilter";

export type BomWhereInput = {
  bomName?: StringFilter;
  bomRevision?: IntNullableFilter;
  className?: StringNullableFilter;
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  id?: StringFilter;
  schemaVersion?: StringNullableFilter;
  unitProcedure?: UnitProcedureListRelationFilter;
  unitProceduresPrimary?: UnitProcedureListRelationFilter;
  wipItem?: StringNullableFilter;
};
