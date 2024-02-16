import { Operation } from "../operation/Operation";
import { ProductionOrderQueue } from "../productionOrderQueue/ProductionOrderQueue";

export type Recipe = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  customerId: string;
  id: string;
  itemDescription: string | null;
  itemId: string;
  mashBill: string | null;
  operation?: Operation | null;
  productionOrderQueues?: Array<ProductionOrderQueue>;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
