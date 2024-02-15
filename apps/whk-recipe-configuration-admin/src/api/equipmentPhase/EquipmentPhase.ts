import { Instruction } from "../instruction/Instruction";
import { Operation } from "../operation/Operation";
import { PhaseParameter } from "../phaseParameter/PhaseParameter";
import { TestParameter } from "../testParameter/TestParameter";

export type EquipmentPhase = {
  bomId: string | null;
  className: string | null;
  createdAt: Date | null;
  createdBy: string;
  description: string | null;
  editedAt: Date | null;
  editedBy: string | null;
  id: string;
  instructions?: Array<Instruction>;
  isClassDefinition: boolean | null;
  name: string;
  operations?: Operation;
  operationSequenceIndex: boolean | null;
  operationStepSequence: number | null;
  phaseParameters?: Array<PhaseParameter>;
  revision: number | null;
  schemaVersion: string | null;
  testParameters?: TestParameter | null;
};
