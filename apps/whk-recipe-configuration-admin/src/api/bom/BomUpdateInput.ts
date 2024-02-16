import { InputJsonValue } from "../../types";
import { EquipmentPhaseUpdateManyWithoutBomsInput } from "./EquipmentPhaseUpdateManyWithoutBomsInput";

export type BomUpdateInput = {
  batches?: InputJsonValue;
  bomItems?: InputJsonValue;
  bomName?: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy?: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutBomsInput;
  operationSteps?: InputJsonValue;
  schemaVersion?: string | null;
  wipItemId?: string | null;
};
