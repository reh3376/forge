import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DashboardServiceBase } from "./base/dashboard.service.base";

@Injectable()
export class DashboardService extends DashboardServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
