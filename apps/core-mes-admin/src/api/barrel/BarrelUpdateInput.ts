import { LotWhereUniqueInput } from "../lot/LotWhereUniqueInput";

export type BarrelUpdateInput = {
  createdBy?: string;
  filledAt?: Date | null;
  filledBy?: string;
  lot?: LotWhereUniqueInput | null;
  serialNumber?: string;
  updatedBy?: string | null;
};
