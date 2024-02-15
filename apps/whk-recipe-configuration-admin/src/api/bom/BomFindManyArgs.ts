import { BomWhereInput } from "./BomWhereInput";
import { BomOrderByInput } from "./BomOrderByInput";

export type BomFindManyArgs = {
  where?: BomWhereInput;
  orderBy?: Array<BomOrderByInput>;
  skip?: number;
  take?: number;
};
