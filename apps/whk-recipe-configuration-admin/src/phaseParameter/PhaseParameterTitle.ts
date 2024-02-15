import { PhaseParameter as TPhaseParameter } from "../api/phaseParameter/PhaseParameter";

export const PHASEPARAMETER_TITLE_FIELD = "typeName";

export const PhaseParameterTitle = (record: TPhaseParameter): string => {
  return record.typeName?.toString() || String(record.id);
};
