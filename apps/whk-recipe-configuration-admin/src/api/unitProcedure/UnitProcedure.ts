import { Operation } from "../operation/Operation";
import { Procedure } from "../procedure/Procedure";

export type UnitProcedure = {
  classId?: UnitProcedure | null;
  createdAt: Date;
  createdBy: string;
  description: string | null;
  id: string;
  isClassDef: boolean | null;
  name: string;
  operations?: Array<Operation>;
  procedure?: Procedure;
  revision: number | null;
  schemaVersion: string | null;
  unitProcedure?: Array<UnitProcedure>;
  updatedAt: Date;
  updatedBy: string | null;
};
