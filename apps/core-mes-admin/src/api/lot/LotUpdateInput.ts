import { BarrelUpdateManyWithoutLotsInput } from "./BarrelUpdateManyWithoutLotsInput";

export type LotUpdateInput = {
  barrels?: BarrelUpdateManyWithoutLotsInput;
  createdBy?: string;
  item?: string;
  purchaseOrderLoadedIn?: string | null;
  purchaseOrderRejectedLot?: string | null;
  updatedBy?: string | null;
};
