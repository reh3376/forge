import { EquipmentPhaseCreateNestedManyWithoutBomsInput } from "./EquipmentPhaseCreateNestedManyWithoutBomsInput";
import { UnitProcedureCreateNestedManyWithoutBomsInput } from "./UnitProcedureCreateNestedManyWithoutBomsInput";

export type BomCreateInput = {
  bomName: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy: string;
  editedBy?: string | null;
  equipmentPhases?: EquipmentPhaseCreateNestedManyWithoutBomsInput;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureCreateNestedManyWithoutBomsInput;
  unitProceduresPrimary?: UnitProcedureCreateNestedManyWithoutBomsInput;
  wipItemId?: string | null;
};
