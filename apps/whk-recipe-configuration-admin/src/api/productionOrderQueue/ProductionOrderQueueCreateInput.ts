import { ProcedureWhereUniqueInput } from "../procedure/ProcedureWhereUniqueInput";

export type ProductionOrderQueueCreateInput = {
  accountId: string;
  active: boolean;
  createdBy: string;
  procedure: ProcedureWhereUniqueInput;
  queueIndex?: number | null;
  revision: number;
  salesOrderId: string;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
