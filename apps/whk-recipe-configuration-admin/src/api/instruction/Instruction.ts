import { OperationStep } from "../operationStep/OperationStep";
import { JsonValue } from "type-fest";

export type Instruction = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  editedBy: string | null;
  filePath: string;
  id: string;
  instructionRevision: number;
  operationStep?: Array<OperationStep>;
  routes: JsonValue;
  schemaVersion: string;
  updatedAt: Date;
};
