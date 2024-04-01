import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { ProcedureUpdateManyWithoutProceduresInput } from "./ProcedureUpdateManyWithoutProceduresInput";
import { ProductionOrderQueueUpdateManyWithoutProceduresInput } from "./ProductionOrderQueueUpdateManyWithoutProceduresInput";
import { UnitProcedureUpdateManyWithoutProceduresInput } from "./UnitProcedureUpdateManyWithoutProceduresInput";

export type ProcedureUpdateInput = {
  active?: boolean | null;
  classId?: ProcedureWhereUniqueInput | null;
  createdBy?: string;
  description?: string | null;
  instances?: ProcedureUpdateManyWithoutProceduresInput;
  isClassDefinition?: boolean | null;
  name?: "Line1" | null;
  productionOrderQueues?: ProductionOrderQueueUpdateManyWithoutProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureUpdateManyWithoutProceduresInput;
  updatedBy?: string | null;
};
