import { StringFilter } from "../../util/StringFilter";
import { BooleanFilter } from "../../util/BooleanFilter";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { IntFilter } from "../../util/IntFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";

export type ProductionOrderQueueWhereInput = {
  accountId?: StringFilter;
  active?: BooleanFilter;
  createdBy?: StringFilter;
  id?: StringFilter;
  procedure?: ProcedureWhereUniqueInput;
  queueIndex?: IntNullableFilter;
  revision?: IntFilter;
  salesOrderId?: StringFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
