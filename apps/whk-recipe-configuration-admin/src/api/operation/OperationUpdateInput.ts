import { OperationWhereUniqueInput } from "./OperationWhereUniqueInput";
import { EquipmentPhaseUpdateManyWithoutOperationsInput } from "./EquipmentPhaseUpdateManyWithoutOperationsInput";
import { OperationUpdateManyWithoutOperationsInput } from "./OperationUpdateManyWithoutOperationsInput";
import { UnitProcedureWhereUniqueInput } from "../unitProcedure/UnitProcedureWhereUniqueInput";

export type OperationUpdateInput = {
  abbreviation?: string;
  active?: boolean | null;
  classId?: OperationWhereUniqueInput | null;
  createdBy?: string;
  description?: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutOperationsInput;
  instances?: OperationUpdateManyWithoutOperationsInput;
  isClassDefinition?: boolean | null;
  name?: string;
  path?: string;
  procedureSequenceIndex?: number;
  revision?: number;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureWhereUniqueInput | null;
};
