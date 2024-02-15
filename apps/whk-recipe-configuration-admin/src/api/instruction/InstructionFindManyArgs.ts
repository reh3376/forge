import { InstructionWhereInput } from "./InstructionWhereInput";
import { InstructionOrderByInput } from "./InstructionOrderByInput";

export type InstructionFindManyArgs = {
  where?: InstructionWhereInput;
  orderBy?: Array<InstructionOrderByInput>;
  skip?: number;
  take?: number;
};
