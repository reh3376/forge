import { ParameterType as TParameterType } from "../api/parameterType/ParameterType";

export const PARAMETERTYPE_TITLE_FIELD = "typeName";

export const ParameterTypeTitle = (record: TParameterType): string => {
  return record.typeName?.toString() || String(record.id);
};
