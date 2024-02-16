import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { ProductionOrderQueueCreateNestedManyWithoutRecipesInput } from "./ProductionOrderQueueCreateNestedManyWithoutRecipesInput";

export type RecipeCreateInput = {
  active?: boolean | null;
  createdBy: string;
  customerId: string;
  itemDescription?: string | null;
  itemId: string;
  mashBill?: string | null;
  operation?: OperationWhereUniqueInput | null;
  productionOrderQueues?: ProductionOrderQueueCreateNestedManyWithoutRecipesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
