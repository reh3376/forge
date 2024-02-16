import { RecipeWhereUniqueInput } from "../recipe/RecipeWhereUniqueInput";

export type ProductionOrderQueueUpdateInput = {
  accountId?: string;
  active?: boolean;
  createdBy?: string;
  queueIndex?: number | null;
  recipe?: RecipeWhereUniqueInput | null;
  revision?: number;
  salesOrderId?: string;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
