import { LotWhereUniqueInput } from "../lot/LotWhereUniqueInput";

export type BarrelCreateInput = {
  createdBy: string;
  filledAt?: Date | null;
  filledBy: string;
  lot?: LotWhereUniqueInput | null;
  serialNumber: string;
  updatedBy?: string | null;
};
