import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchMaterialConsumptionServiceBase } from "./base/batchMaterialConsumption.service.base";

@Injectable()
export class BatchMaterialConsumptionService extends BatchMaterialConsumptionServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
