import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { ProductionOrderQueueUpdateManyWithoutRecipesInput } from "./ProductionOrderQueueUpdateManyWithoutRecipesInput";

export type RecipeUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  customer?: string | null;
  item?: string | null;
  itemDescription?: string | null;
  mashBill?: string | null;
  operation?: OperationWhereUniqueInput | null;
  productionOrderQueues?: ProductionOrderQueueUpdateManyWithoutRecipesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: Date | null;
};
