import { Bom as TBom } from "../api/bom/Bom";

export const BOM_TITLE_FIELD = "bomName";

export const BomTitle = (record: TBom): string => {
  return record.bomName?.toString() || String(record.id);
};
