import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { ProductionOrderQueueListRelationFilter } from "../productionOrderQueue/ProductionOrderQueueListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";

export type RecipeWhereInput = {
  active?: BooleanNullableFilter;
  createdBy?: StringFilter;
  customerId?: StringFilter;
  id?: StringFilter;
  itemDescription?: StringNullableFilter;
  itemId?: StringFilter;
  mashBill?: StringNullableFilter;
  operation?: OperationWhereUniqueInput;
  productionOrderQueues?: ProductionOrderQueueListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
