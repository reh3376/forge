import { OperationStepWhereInput } from "./OperationStepWhereInput";
import { OperationStepOrderByInput } from "./OperationStepOrderByInput";

export type OperationStepFindManyArgs = {
  where?: OperationStepWhereInput;
  orderBy?: Array<OperationStepOrderByInput>;
  skip?: number;
  take?: number;
};
