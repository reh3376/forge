import { ProcedureWhereUniqueInput } from "./ProcedureWhereUniqueInput";
import { ProcedureCreateNestedManyWithoutProceduresInput } from "./ProcedureCreateNestedManyWithoutProceduresInput";
import { ProductionOrderQueueCreateNestedManyWithoutProceduresInput } from "./ProductionOrderQueueCreateNestedManyWithoutProceduresInput";
import { UnitProcedureCreateNestedManyWithoutProceduresInput } from "./UnitProcedureCreateNestedManyWithoutProceduresInput";

export type ProcedureCreateInput = {
  active?: boolean | null;
  classId?: ProcedureWhereUniqueInput | null;
  createdBy: string;
  description?: string | null;
  instances?: ProcedureCreateNestedManyWithoutProceduresInput;
  isClassDefinition?: boolean | null;
  name?: "Line1" | null;
  productionOrderQueues?: ProductionOrderQueueCreateNestedManyWithoutProceduresInput;
  revision?: number | null;
  schemaVersion?: string | null;
  unitProcedures?: UnitProcedureCreateNestedManyWithoutProceduresInput;
  updatedBy?: string | null;
};
