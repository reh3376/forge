import { Operation } from "../operation/Operation";
import { Procedure } from "../procedure/Procedure";

export type UnitProcedure = {
  active: boolean | null;
  classId?: UnitProcedure | null;
  createdAt: Date;
  createdBy: string;
  description: string | null;
  id: string;
  instances?: Array<UnitProcedure>;
  isClassDef: boolean | null;
  name?:
    | "Mashing01"
    | "Fermentation01"
    | "Distillation01"
    | "Processing01"
    | "Granary01";
  operations?: Array<Operation>;
  procedure?: Procedure;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
