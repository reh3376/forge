import { InputJsonValue } from "../../types";
import { EquipmentPhaseCreateNestedManyWithoutBomsInput } from "./EquipmentPhaseCreateNestedManyWithoutBomsInput";

export type BomCreateInput = {
  batches?: InputJsonValue;
  bomItems: InputJsonValue;
  bomName: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseCreateNestedManyWithoutBomsInput;
  operationSteps?: InputJsonValue;
  schemaVersion?: string | null;
  wipItemId?: string | null;
};
