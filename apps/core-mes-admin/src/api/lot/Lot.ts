import { Barrel } from "../barrel/Barrel";

export type Lot = {
  barrels?: Array<Barrel>;
  createdAt: Date;
  createdBy: string;
  id: string;
  item: string;
  purchaseOrderLoadedIn: string | null;
  purchaseOrderRejectedLot: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
