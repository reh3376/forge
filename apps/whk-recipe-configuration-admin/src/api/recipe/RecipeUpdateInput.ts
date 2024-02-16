import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { ProductionOrderQueueUpdateManyWithoutRecipesInput } from "./ProductionOrderQueueUpdateManyWithoutRecipesInput";

export type RecipeUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  customerId?: string;
  itemDescription?: string | null;
  itemId?: string;
  mashBill?: string | null;
  operation?: OperationWhereUniqueInput | null;
  productionOrderQueues?: ProductionOrderQueueUpdateManyWithoutRecipesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
