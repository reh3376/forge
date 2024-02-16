import { Operation } from "../operation/Operation";

export type Procedure = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  description: string | null;
  id: string;
  name: string | null;
  operations?: Array<Operation>;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};
