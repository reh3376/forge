import { Lot as TLot } from "../api/lot/Lot";

export const LOT_TITLE_FIELD = "item";

export const LotTitle = (record: TLot): string => {
  return record.item?.toString() || String(record.id);
};
