import { UnitProcedure } from "../unitProcedure/UnitProcedure";

export type Procedure = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  description: string | null;
  id: string;
  name: string | null;
  revision: number | null;
  schemaVersion: string | null;
  unitProcedures?: Array<UnitProcedure>;
  updatedAt: Date;
  updatedBy: string | null;
};
