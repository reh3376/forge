import { ProductionOrderQueue as TProductionOrderQueue } from "../api/productionOrderQueue/ProductionOrderQueue";

export const PRODUCTIONORDERQUEUE_TITLE_FIELD = "accountId";

export const ProductionOrderQueueTitle = (
  record: TProductionOrderQueue
): string => {
  return record.accountId?.toString() || String(record.id);
};
