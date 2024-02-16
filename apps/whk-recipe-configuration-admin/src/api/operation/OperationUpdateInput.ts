import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { EquipmentPhaseUpdateManyWithoutOperationsInput } from "./EquipmentPhaseUpdateManyWithoutOperationsInput";
import { OperationUpdateManyWithoutOperationsInput } from "./OperationUpdateManyWithoutOperationsInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { RecipeUpdateManyWithoutOperationsInput } from "./RecipeUpdateManyWithoutOperationsInput";

export type OperationUpdateInput = {
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
  procedure?: ProcedureWhereUniqueInput | null;
  procedureSequenceIndex?: number;
  recipes?: RecipeUpdateManyWithoutOperationsInput;
  revision?: number;
  schemaVersion?: string | null;
};
