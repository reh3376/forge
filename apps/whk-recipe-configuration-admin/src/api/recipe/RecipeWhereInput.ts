import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { ProductionOrderQueueListRelationFilter } from "../productionOrderQueue/ProductionOrderQueueListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";

export type RecipeWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  customer?: StringNullableFilter;
  id?: StringFilter;
  item?: StringNullableFilter;
  itemDescription?: StringNullableFilter;
  mashBill?: StringNullableFilter;
  operation?: OperationWhereUniqueInput;
  productionOrderQueues?: ProductionOrderQueueListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: DateTimeNullableFilter;
};
