import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";

export type RecipeCreateInput = {
  active?: boolean | null;
  createdBy: string;
  operation?: OperationWhereUniqueInput | null;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: Date | null;
};
