import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { EquipmentPhaseCreateNestedManyWithoutOperationsInput } from "./EquipmentPhaseCreateNestedManyWithoutOperationsInput";
import { OperationCreateNestedManyWithoutOperationsInput } from "./OperationCreateNestedManyWithoutOperationsInput";
import { RecipeCreateNestedManyWithoutOperationsInput } from "./RecipeCreateNestedManyWithoutOperationsInput";
import { UnitProcedureWhereUniqueInput } from "../unitProcedure/UnitProcedureWhereUniqueInput";

export type OperationCreateInput = {
  abbreviation: string;
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
  procedureSequenceIndex: number;
  recipes?: RecipeCreateNestedManyWithoutOperationsInput;
  revision: number;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureWhereUniqueInput | null;
};
