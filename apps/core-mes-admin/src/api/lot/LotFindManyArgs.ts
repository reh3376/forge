import { LotWhereInput } from "./LotWhereInput";
import { LotOrderByInput } from "./LotOrderByInput";

export type LotFindManyArgs = {
  where?: LotWhereInput;
  orderBy?: Array<LotOrderByInput>;
  skip?: number;
  take?: number;
};
