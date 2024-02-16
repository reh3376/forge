import { Operation } from "../operation/Operation";
import { Procedure } from "../procedure/Procedure";

export type UnitProcedure = {
  createdAt: Date;
  createdBy: string;
  description: string | null;
  id: string;
  name: string;
  operations?: Array<Operation>;
  procedure?: Procedure;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
