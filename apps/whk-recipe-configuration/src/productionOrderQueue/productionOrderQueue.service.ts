import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderQueueServiceBase } from "./base/productionOrderQueue.service.base";

@Injectable()
export class ProductionOrderQueueService extends ProductionOrderQueueServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
