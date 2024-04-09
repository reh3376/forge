import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderServiceBase } from "./base/productionOrder.service.base";

@Injectable()
export class ProductionOrderService extends ProductionOrderServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
