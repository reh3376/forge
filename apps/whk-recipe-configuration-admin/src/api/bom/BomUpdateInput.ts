import { EquipmentPhaseUpdateManyWithoutBomsInput } from "./EquipmentPhaseUpdateManyWithoutBomsInput";
import { UnitProcedureUpdateManyWithoutBomsInput } from "./UnitProcedureUpdateManyWithoutBomsInput";

export type BomUpdateInput = {
  bomName?: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy?: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseUpdateManyWithoutBomsInput;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureUpdateManyWithoutBomsInput;
  unitProceduresPrimary?: UnitProcedureUpdateManyWithoutBomsInput;
  wipItemId?: string | null;
};
