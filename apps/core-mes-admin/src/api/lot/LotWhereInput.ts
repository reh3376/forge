import { BarrelListRelationFilter } from "../barrel/BarrelListRelationFilter";
import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";

export type LotWhereInput = {
  barrels?: BarrelListRelationFilter;
  createdBy?: StringFilter;
  id?: StringFilter;
  item?: StringFilter;
  purchaseOrderLoadedIn?: StringNullableFilter;
  purchaseOrderRejectedLot?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
