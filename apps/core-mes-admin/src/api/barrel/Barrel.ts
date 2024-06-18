import { Lot } from "../lot/Lot";

export type Barrel = {
  createdAt: Date;
  createdBy: string;
  filledAt: Date | null;
  filledBy: string;
  id: string;
  lot?: Lot | null;
  serialNumber: string;
  updatedAt: Date;
  updatedBy: string | null;
};
