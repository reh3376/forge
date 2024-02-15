import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { ProductionOrderQueueCreateNestedManyWithoutRecipesInput } from "./ProductionOrderQueueCreateNestedManyWithoutRecipesInput";

export type RecipeCreateInput = {
  active?: boolean | null;
  createdBy: string;
  customer?: string | null;
  item?: string | null;
  itemDescription?: string | null;
  mashBill?: string | null;
  operation?: OperationWhereUniqueInput | null;
  productionOrderQueues?: ProductionOrderQueueCreateNestedManyWithoutRecipesInput;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: Date | null;
};
