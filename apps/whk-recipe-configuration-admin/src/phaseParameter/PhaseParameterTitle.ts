import { PhaseParameter as TPhaseParameter } from "../api/phaseParameter/PhaseParameter";

export const PHASEPARAMETER_TITLE_FIELD = "name";

export const PhaseParameterTitle = (record: TPhaseParameter): string => {
  return record.name?.toString() || String(record.id);
};
