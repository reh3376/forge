import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";
import { Recipe } from "../recipe/Recipe";
import { UnitProcedure } from "../unitProcedure/UnitProcedure";

export type Operation = {
  abbreviation: string;
  active: boolean | null;
  classId?: Operation | null;
  createdAt: Date | null;
  createdBy: string;
  description: string;
  editedBy: string | null;
  equipmentPhases?: Array<EquipmentPhase>;
  id: string;
  instances?: Array<Operation>;
  isClassDefinition: boolean | null;
  name: string;
  path: string;
  procedureSequenceIndex: number;
  recipes?: Array<Recipe>;
  revision: number;
  schemaVersion: string | null;
  unitProcedure?: UnitProcedure | null;
  updatedAt: Date | null;
};
