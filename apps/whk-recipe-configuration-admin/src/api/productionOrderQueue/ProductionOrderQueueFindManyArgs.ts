import { ProductionOrderQueueWhereInput } from "./ProductionOrderQueueWhereInput";
import { ProductionOrderQueueOrderByInput } from "./ProductionOrderQueueOrderByInput";

export type ProductionOrderQueueFindManyArgs = {
  where?: ProductionOrderQueueWhereInput;
  orderBy?: Array<ProductionOrderQueueOrderByInput>;
  skip?: number;
  take?: number;
};
