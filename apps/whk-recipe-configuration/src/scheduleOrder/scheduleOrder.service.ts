import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderServiceBase } from "./base/scheduleOrder.service.base";

@Injectable()
export class ScheduleOrderService extends ScheduleOrderServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
