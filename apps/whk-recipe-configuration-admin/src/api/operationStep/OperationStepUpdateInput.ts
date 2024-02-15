import { InstructionUpdateManyWithoutOperationStepsInput } from "./InstructionUpdateManyWithoutOperationStepsInput";
import { OperationWhereUniqueInput } from "../operation/OperationWhereUniqueInput";
import { InputJsonValue } from "../../types";

export type OperationStepUpdateInput = {
  bomId?: string | null;
  className?: string | null;
  createdBy?: string;
  editedBy?: string | null;
  instructions?: InstructionUpdateManyWithoutOperationStepsInput;
  operations?: OperationWhereUniqueInput;
  operationStepDescription?: string | null;
  operationStepName?: string;
  operationStepRevision?: number | null;
  operationStepSequence?: number | null;
  recipeId?: string | null;
  schemaVersion?: string | null;
  sequenceOperation?: boolean | null;
  tests?: InputJsonValue;
};
