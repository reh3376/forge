import { EquipmentPhase } from "../equipmentPhase/EquipmentPhase";
import { Procedure } from "../procedure/Procedure";
import { Recipe } from "../recipe/Recipe";

export type Operation = {
  active: boolean | null;
  classId?: Operation | null;
  createdAt: Date | null;
  createdBy: string;
  description: string;
  editedBy: string | null;
  equipmentPhases?: Array<EquipmentPhase>;
  id: string;
  isClassDefinition: boolean | null;
  name: string;
  operations?: Array<Operation>;
  path: string;
  procedure?: Procedure | null;
  procedureSequenceIndex: number;
  recipes?: Array<Recipe>;
  revision: number;
  schemaVersion: string | null;
  updatedAt: Date | null;
};
