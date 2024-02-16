import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { OperationUpdateManyWithoutOperationsInput } from "./OperationUpdateManyWithoutOperationsInput";
import { EquipmentPhaseUpdateManyWithoutOperationsInput } from "./EquipmentPhaseUpdateManyWithoutOperationsInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { RecipeUpdateManyWithoutOperationsInput } from "./RecipeUpdateManyWithoutOperationsInput";

export type OperationUpdateInput = {
  active?: boolean | null;
  classId?: OperationWhereUniqueInput | null;
  createdBy?: string;
  description?: string;
  editedBy?: string | null;
  isClassDefinition?: boolean | null;
  name?: string;
  operations?: OperationUpdateManyWithoutOperationsInput;
  operationSteps?: EquipmentPhaseUpdateManyWithoutOperationsInput;
  path?: string;
  procedure?: ProcedureWhereUniqueInput | null;
  procedureSequenceIndex?: number;
  recipes?: RecipeUpdateManyWithoutOperationsInput;
  revision?: number;
  schemaVersion?: string | null;
};
