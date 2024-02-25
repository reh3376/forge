import { Procedure } from "../procedure/Procedure";

export type ProductionOrderQueue = {
  accountId: string;
  active: boolean;
  createdAt: Date;
  createdBy: string;
  id: string;
  procedure?: Procedure;
  queueIndex: number | null;
  revision: number;
  salesOrderId: string;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
