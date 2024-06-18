import { BarrelWhereInput } from "./BarrelWhereInput";
import { BarrelOrderByInput } from "./BarrelOrderByInput";

export type BarrelFindManyArgs = {
  where?: BarrelWhereInput;
  orderBy?: Array<BarrelOrderByInput>;
  skip?: number;
  take?: number;
};
