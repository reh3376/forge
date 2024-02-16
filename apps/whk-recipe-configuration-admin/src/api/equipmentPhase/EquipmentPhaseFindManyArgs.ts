import { EquipmentPhaseWhereInput } from "./EquipmentPhaseWhereInput";
import { EquipmentPhaseOrderByInput } from "./EquipmentPhaseOrderByInput";

export type EquipmentPhaseFindManyArgs = {
  where?: EquipmentPhaseWhereInput;
  orderBy?: Array<EquipmentPhaseOrderByInput>;
  skip?: number;
  take?: number;
};
