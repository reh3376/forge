import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { ProcedureListRelationFilter } from "./ProcedureListRelationFilter";
import { ProductionOrderQueueListRelationFilter } from "../productionOrderQueue/ProductionOrderQueueListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { UnitProcedureListRelationFilter } from "../unitProcedure/UnitProcedureListRelationFilter";

export type ProcedureWhereInput = {
  active?: BooleanNullableFilter;
  classId?: ProcedureWhereUniqueInput;
  createdBy?: StringFilter;
  description?: StringNullableFilter;
  id?: StringFilter;
  instances?: ProcedureListRelationFilter;
  isClassDefinition?: BooleanNullableFilter;
  name?: StringNullableFilter;
  productionOrderQueues?: ProductionOrderQueueListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  unitProcedures?: UnitProcedureListRelationFilter;
  updatedBy?: StringNullableFilter;
};
