import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderRecipeInstanceServiceBase } from "./base/productionOrderRecipeInstance.service.base";

@Injectable()
export class ProductionOrderRecipeInstanceService extends ProductionOrderRecipeInstanceServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
