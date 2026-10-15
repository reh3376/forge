import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryTransferServiceBase } from "./base/inventoryTransfer.service.base";

@Injectable()
export class InventoryTransferService extends InventoryTransferServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
