import { EquipmentPhaseUpdateManyWithoutOperationsInput } from "./EquipmentPhaseUpdateManyWithoutOperationsInput";
import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type OperationUpdateInput = {
  active?: boolean | null;
  createdBy?: string;
  description?: string;
  editedBy?: string | null;
  globalUuid?: string | null;
  name?: string;
  operationSteps?: EquipmentPhaseUpdateManyWithoutOperationsInput;
  procedure?: ProcedureWhereUniqueInput | null;
  procedureSequenceIndex?: number;
  revision?: number;
  schemaVersion?: string | null;
};
