import { OperationWhereInput } from "./OperationWhereInput";
import { OperationOrderByInput } from "./OperationOrderByInput";

export type OperationFindManyArgs = {
  where?: OperationWhereInput;
  orderBy?: Array<OperationOrderByInput>;
  skip?: number;
  take?: number;
};
