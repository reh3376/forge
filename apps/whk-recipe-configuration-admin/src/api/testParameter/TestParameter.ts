import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";
import { JsonValue } from "type-fest";

export type TestParameter = {
  active: boolean;
  classId?: TestParameter | null;
  createdAt: Date;
  createdBy: string;
  description: string | null;
  editedAt: Date | null;
  editedBy: string | null;
  equipmentPhases?: Array<EquipmentPhase>;
  id: string;
  instances?: Array<TestParameter>;
  isClassDef: boolean | null;
  name: string;
  schemaVersion: string | null;
  testDetails: string | null;
  testParamRevision: string | null;
  testParamUnits?: "Lbs" | "Perc" | "Gal" | "Bu" | "PassFail" | null;
  testPass: boolean | null;
  testResult: JsonValue;
  testSetpointBooleanValue: boolean | null;
  testSetpointLowerLimit: number | null;
  testSetpointType?: "Boolean" | "Numerical" | null;
  testSetpointUpperLimit: number | null;
  testSetpointValue: number | null;
  tooltip: string | null;
};
