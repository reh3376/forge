import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PurchaseOrderServiceBase } from "./base/purchaseOrder.service.base";

@Injectable()
export class PurchaseOrderService extends PurchaseOrderServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
