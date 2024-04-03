import { UnitProcedureUpdateManyWithoutBomsInput } from "./UnitProcedureUpdateManyWithoutBomsInput";

export type BomUpdateInput = {
  bomName?: string;
  bomRevision?: number | null;
  className?: string | null;
  createdBy?: string;
  editedBy?: string | null;
  schemaVersion?: string | null;
  unitProcedure?: UnitProcedureUpdateManyWithoutBomsInput;
  unitProceduresPrimary?: UnitProcedureUpdateManyWithoutBomsInput;
  wipItem?: string | null;
};
