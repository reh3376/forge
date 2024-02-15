import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";

export type RecipeCreateInput = {
  active?: boolean | null;
  createdBy: string;
  customer?: string | null;
  item?: string | null;
  itemDescription?: string | null;
  mashBill?: string | null;
  operation?: OperationWhereUniqueInput | null;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: Date | null;
};
