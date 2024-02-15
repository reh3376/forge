import { StringFilter } from "../../util/StringFilter";
import { BooleanFilter } from "../../util/BooleanFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { RecipeWhereUniqueInput } from "../recipe/RecipeWhereUniqueInput";
import { StringNullableFilter } from "../../util/StringNullableFilter";

export type ProductionOrderQueueWhereInput = {
  accountId?: StringFilter;
  active?: BooleanFilter;
  createdBy?: StringFilter;
  id?: StringFilter;
  queueIndex?: IntNullableFilter;
  recipe?: RecipeWhereUniqueInput;
  revision?: StringFilter;
  salesOrderId?: StringFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
