import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionScheduleServiceBase } from "./base/productionSchedule.service.base";

@Injectable()
export class ProductionScheduleService extends ProductionScheduleServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
