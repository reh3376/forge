import { UnitProcedure } from "../unitProcedure/UnitProcedure";

export type Procedure = {
  active: boolean | null;
  classId?: Procedure | null;
  createdAt: Date;
  createdBy: string;
  description: string | null;
  id: string;
  instances?: Array<Procedure>;
  isClassDefinition: boolean | null;
  name: string | null;
  revision: number | null;
  schemaVersion: string | null;
  unitProcedures?: Array<UnitProcedure>;
  updatedAt: Date;
  updatedBy: string | null;
};
