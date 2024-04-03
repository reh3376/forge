import { UnitProcedureCreateNestedManyWithoutBomsInput } from "./UnitProcedureCreateNestedManyWithoutBomsInput";

export type BomCreateInput = {
  bomName: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy: string;
  editedBy?: string | null;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureCreateNestedManyWithoutBomsInput;
  unitProceduresPrimary?: UnitProcedureCreateNestedManyWithoutBomsInput;
  wipItem?: string | null;
};
