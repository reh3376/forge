import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderBomItemServiceBase } from "./base/productionOrderBomItem.service.base";

@Injectable()
export class ProductionOrderBomItemService extends ProductionOrderBomItemServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
