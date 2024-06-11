import { StringFilter } from "../../util/StringFilter";
import { DateTimeNullableFilter } from "../../util/DateTimeNullableFilter";
import { LotWhereUniqueInput } from "../lot/LotWhereUniqueInput";
import { StringNullableFilter } from "../../util/StringNullableFilter";

export type BarrelWhereInput = {
  createdBy?: StringFilter;
  filledAt?: DateTimeNullableFilter;
  filledBy?: StringFilter;
  id?: StringFilter;
  lot?: LotWhereUniqueInput;
  serialNumber?: StringFilter;
  updatedBy?: StringNullableFilter;
};
