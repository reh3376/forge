import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { EquipmentPhaseCreateNestedManyWithoutOperationsInput } from "./EquipmentPhaseCreateNestedManyWithoutOperationsInput";
import { OperationCreateNestedManyWithoutOperationsInput } from "./OperationCreateNestedManyWithoutOperationsInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { RecipeCreateNestedManyWithoutOperationsInput } from "./RecipeCreateNestedManyWithoutOperationsInput";

export type OperationCreateInput = {
  active?: boolean | null;
  classId?: OperationWhereUniqueInput | null;
  createdBy: string;
  description: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseCreateNestedManyWithoutOperationsInput;
  isClassDefinition?: boolean | null;
  name: string;
  operations?: OperationCreateNestedManyWithoutOperationsInput;
  path: string;
  procedure?: ProcedureWhereUniqueInput | null;
  procedureSequenceIndex: number;
  recipes?: RecipeCreateNestedManyWithoutOperationsInput;
  revision: number;
  schemaVersion?: string | null;
};
