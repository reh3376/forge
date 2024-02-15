import { TestParameterWhereInput } from "./TestParameterWhereInput";
import { TestParameterOrderByInput } from "./TestParameterOrderByInput";

export type TestParameterFindManyArgs = {
  where?: TestParameterWhereInput;
  orderBy?: Array<TestParameterOrderByInput>;
  skip?: number;
  take?: number;
};
