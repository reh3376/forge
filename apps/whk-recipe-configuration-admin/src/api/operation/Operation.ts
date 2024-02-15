import { OperationStep } from "../operationStep/OperationStep";
import { JsonValue } from "type-fest";

export type Operation = {
  active: boolean | null;
  createdAt: Date | null;
  createdBy: string;
  editedBy: string | null;
  globalUuid: string | null;
  id: string;
  operationDescription: string;
  operationName: string;
  operationRevision: number;
  operationSequenceNumber: number;
  operationSteps?: Array<OperationStep>;
  route: JsonValue;
  schemaVersion: string | null;
  updatedAt: Date | null;
};
