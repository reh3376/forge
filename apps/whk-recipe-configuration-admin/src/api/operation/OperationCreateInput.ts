import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { EquipmentPhaseCreateNestedManyWithoutOperationsInput } from "./EquipmentPhaseCreateNestedManyWithoutOperationsInput";
import { OperationCreateNestedManyWithoutOperationsInput } from "./OperationCreateNestedManyWithoutOperationsInput";
import { UnitProcedureWhereUniqueInput } from "../unitProcedure/UnitProcedureWhereUniqueInput";

export type OperationCreateInput = {
  abbreviation: string;
  active?: boolean | null;
  classId?: OperationWhereUniqueInput | null;
  createdBy: string;
  description: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseCreateNestedManyWithoutOperationsInput;
  instances?: OperationCreateNestedManyWithoutOperationsInput;
  isClassDefinition?: boolean | null;
  name: string;
  path: string;
  procedureSequenceIndex: number;
  revision: number;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureWhereUniqueInput | null;
};
