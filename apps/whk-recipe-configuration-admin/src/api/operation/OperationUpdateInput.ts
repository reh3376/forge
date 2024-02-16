import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { EquipmentPhaseUpdateManyWithoutOperationsInput } from "./EquipmentPhaseUpdateManyWithoutOperationsInput";
import { OperationUpdateManyWithoutOperationsInput } from "./OperationUpdateManyWithoutOperationsInput";
import { RecipeUpdateManyWithoutOperationsInput } from "./RecipeUpdateManyWithoutOperationsInput";
import { UnitProcedureWhereUniqueInput } from "../unitProcedure/UnitProcedureWhereUniqueInput";

export type OperationUpdateInput = {
  abbreviation?: string;
  active?: boolean | null;
  classId?: OperationWhereUniqueInput | null;
  createdBy?: string;
  description?: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutOperationsInput;
  isClassDefinition?: boolean | null;
  name?: string;
  operations?: OperationUpdateManyWithoutOperationsInput;
  path?: string;
  procedureSequenceIndex?: number;
  recipes?: RecipeUpdateManyWithoutOperationsInput;
  revision?: number;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureWhereUniqueInput | null;
};
