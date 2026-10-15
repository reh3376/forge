import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryLogServiceBase } from "./base/inventoryLog.service.base";

@Injectable()
export class InventoryLogService extends InventoryLogServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
