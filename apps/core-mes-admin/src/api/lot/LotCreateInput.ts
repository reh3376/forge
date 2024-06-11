import { BarrelCreateNestedManyWithoutLotsInput } from "./BarrelCreateNestedManyWithoutLotsInput";

export type LotCreateInput = {
  barrels?: BarrelCreateNestedManyWithoutLotsInput;
  createdBy: string;
  item: string;
  purchaseOrderLoadedIn?: string | null;
  purchaseOrderRejectedLot?: string | null;
  updatedBy?: string | null;
};
