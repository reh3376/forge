import { Operation } from "../operation/Operation";

export type Recipe = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  id: string;
  operation?: Operation | null;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: Date | null;
};
