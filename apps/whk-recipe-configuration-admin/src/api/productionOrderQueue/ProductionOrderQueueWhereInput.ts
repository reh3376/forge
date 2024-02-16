import { StringFilter } from "../../util/StringFilter";
import { BooleanFilter } from "../../util/BooleanFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { RecipeWhereUniqueInput } from "../recipe/RecipeWhereUniqueInput";
import { IntFilter } from "../../util/IntFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";

export type ProductionOrderQueueWhereInput = {
  accountId?: StringFilter;
  active?: BooleanFilter;
  createdBy?: StringFilter;
  id?: StringFilter;
  queueIndex?: IntNullableFilter;
  recipe?: RecipeWhereUniqueInput;
  revision?: IntFilter;
  salesOrderId?: StringFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
