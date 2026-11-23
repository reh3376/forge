import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SalesOrderServiceBase } from "./base/salesOrder.service.base";

@Injectable()
export class SalesOrderService extends SalesOrderServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
