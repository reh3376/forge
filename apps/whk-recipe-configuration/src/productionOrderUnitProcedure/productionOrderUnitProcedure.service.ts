import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderUnitProcedureServiceBase } from "./base/productionOrderUnitProcedure.service.base";

@Injectable()
export class ProductionOrderUnitProcedureService extends ProductionOrderUnitProcedureServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
