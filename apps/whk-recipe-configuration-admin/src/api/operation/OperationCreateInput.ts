import { EquipmentPhaseCreateNestedManyWithoutOperationsInput } from "./EquipmentPhaseCreateNestedManyWithoutOperationsInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type OperationCreateInput = {
  active?: boolean | null;
  createdBy: string;
  description: string;
  editedBy?: string | null;
  globalUuid?: string | null;
  name: string;
  operationSteps?: EquipmentPhaseCreateNestedManyWithoutOperationsInput;
  procedure?: ProcedureWhereUniqueInput | null;
  procedureSequenceIndex: number;
  revision: number;
  schemaVersion?: string | null;
};
