import { Recipe } from "../recipe/Recipe";

export type ProductionOrderQueue = {
  accountId: string;
  active: boolean;
  createdAt: Date;
  createdBy: string;
  id: string;
  queueIndex: number | null;
  recipe?: Recipe | null;
  revision: string;
  salesOrderId: string;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
