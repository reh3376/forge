import { Instruction } from "../instruction/Instruction";
import { Operation } from "../operation/Operation";
import { JsonValue } from "type-fest";

export type OperationStep = {
  bomId: string | null;
  className: string | null;
  createdAt: Date | null;
  createdBy: string;
  editedAt: Date | null;
  editedBy: string | null;
  id: string;
  instructions?: Array<Instruction>;
  operations?: Operation;
  operationStepDescription: string | null;
  operationStepName: string;
  operationStepRevision: number | null;
  operationStepSequence: number | null;
  recipeId: string | null;
  schemaVersion: string | null;
  sequenceOperation: boolean | null;
  tests: JsonValue;
};
