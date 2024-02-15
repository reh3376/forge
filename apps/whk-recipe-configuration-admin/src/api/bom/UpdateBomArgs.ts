import { BomWhereUniqueInput } from "./BomWhereUniqueInput";
import { BomUpdateInput } from "./BomUpdateInput";

export type UpdateBomArgs = {
  where: BomWhereUniqueInput;
  data: BomUpdateInput;
};
