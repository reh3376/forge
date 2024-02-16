import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { OperationCreateNestedManyWithoutOperationsInput } from "./OperationCreateNestedManyWithoutOperationsInput";
import { EquipmentPhaseCreateNestedManyWithoutOperationsInput } from "./EquipmentPhaseCreateNestedManyWithoutOperationsInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";
import { RecipeCreateNestedManyWithoutOperationsInput } from "./RecipeCreateNestedManyWithoutOperationsInput";

export type OperationCreateInput = {
  active?: boolean | null;
  classId?: OperationWhereUniqueInput | null;
  createdBy: string;
  description: string;
  editedBy?: string | null;
  isClassDefinition?: boolean | null;
  name: string;
  operations?: OperationCreateNestedManyWithoutOperationsInput;
  operationSteps?: EquipmentPhaseCreateNestedManyWithoutOperationsInput;
  path: string;
  procedure?: ProcedureWhereUniqueInput | null;
  procedureSequenceIndex: number;
  recipes?: RecipeCreateNestedManyWithoutOperationsInput;
  revision: number;
  schemaVersion?: string | null;
};
