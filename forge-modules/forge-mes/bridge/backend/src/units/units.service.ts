import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitsServiceBase } from "./base/units.service.base";
import { Prisma } from "@prisma/client";

@Injectable()
export class UnitsService extends UnitsServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async deleteUnits(args: Prisma.UnitsDeleteArgs): Promise<any> {
    // First, find the units record to check if it's MES configured
    const units = await this.prisma.units.findUnique({
      where: args.where,
      select: { mesConfiguredUnit: true },
    });

    // If the unit is NOT MES configured, throw an error
    if (units && units.mesConfiguredUnit !== true) {
      throw new ForbiddenException("Only MES configured units can be deleted");
    }

    // If MES configured, proceed with deletion
    return super.deleteUnits(args);
  }
}
