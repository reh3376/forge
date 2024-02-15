import { Operation } from "../operation/Operation";

export type Recipe = {
  active: boolean | null;
  createdAt: Date;
  createdBy: string;
  customer: string | null;
  id: string;
  item: string | null;
  itemDescription: string | null;
  mashBill: string | null;
  operation?: Operation | null;
  revision: number | null;
  schemaVersion: string | null;
  updatedAt: Date;
  updatedBy: Date | null;
};
