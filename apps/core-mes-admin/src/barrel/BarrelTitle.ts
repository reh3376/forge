import { Barrel as TBarrel } from "../api/barrel/Barrel";

export const BARREL_TITLE_FIELD = "serialNumber";

export const BarrelTitle = (record: TBarrel): string => {
  return record.serialNumber?.toString() || String(record.id);
};
